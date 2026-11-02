-- Profile creation for Supabase Auth.
--
-- Supabase Auth owns email/password; `profiles` is the app's public identity row.
-- The sign-up form passes owner_name, business_name and account_type in the
-- user's metadata, so the trigger copies them across and defaults safely.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'seller');
begin
  if v_account_type not in ('seller', 'customer') then
    v_account_type := 'seller';
  end if;

  insert into public.profiles (id, email, owner_name, business_name, account_type)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'owner_name', ''),
    coalesce(new.raw_user_meta_data ->> 'business_name',
             new.raw_user_meta_data ->> 'owner_name',
             ''),
    v_account_type
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep `shop_slug` unique per shop and absent for customers.
create or replace function public.assign_initial_shop_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base          text;
  candidate     text;
  suffix        integer := 1;
begin
  if new.account_type <> 'seller' or new.shop_slug is not null then
    return new;
  end if;

  base := lower(regexp_replace(coalesce(nullif(new.shop_name, ''), new.business_name, 'shop'),
                               '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if length(base) < 3 then
    base := base || '-shop';
  end if;
  base := left(base, 34);

  candidate := base;
  while exists (select 1 from public.profiles p
                where p.shop_slug is not null and lower(p.shop_slug) = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;

  new.shop_slug := candidate;
  return new;
end;
$$;

drop trigger if exists profiles_assign_shop_slug on public.profiles;
create trigger profiles_assign_shop_slug
  before insert or update of account_type, shop_name, business_name on public.profiles
  for each row execute function public.assign_initial_shop_slug();
