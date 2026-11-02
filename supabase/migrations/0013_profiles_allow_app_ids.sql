-- Allow app-managed account ids in `profiles`.
--
-- The first version of the schema tied profiles.id to auth.users because the plan
-- was to move authentication to Supabase Auth. Authentication still lives in the
-- app, so mirrored accounts have ids that do not exist in auth.users and the
-- foreign key rejected them. Dropping the constraint lets the table hold either
-- kind of id (and it can be restored once auth moves to Supabase).

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'f'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
    raise notice 'dropped profiles foreign key %', constraint_name;
  end if;
end
$$;

-- The trigger from 0009 only runs for real auth.users inserts; mirrored rows are
-- inserted directly by the sync job, so give them a default shop slug there.
create or replace function public.ensure_profile_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text;
  candidate text;
  suffix    integer := 1;
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

drop trigger if exists profiles_ensure_slug on public.profiles;
create trigger profiles_ensure_slug
  before insert on public.profiles
  for each row execute function public.ensure_profile_slug();
