-- The 0009 slug trigger still looked up `public.profiles` by name, so every
-- insert into the renamed `users` table failed with
-- `relation "public.profiles" does not exist`.
--
-- Recreated against `public.users`. The trigger itself follows the rename, so it
-- only needs its body fixed.

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
  while exists (select 1 from public.users u
                where u.shop_slug is not null and lower(u.shop_slug) = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;

  new.shop_slug := candidate;
  return new;
end;
$$;

-- Fail loudly if any other function was missed.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%public.profiles%';

  if remaining > 0 then
    raise warning 'public.profiles still referenced by % function(s)', remaining;
  end if;
end
$$;
