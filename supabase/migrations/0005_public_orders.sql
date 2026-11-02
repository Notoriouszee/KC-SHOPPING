-- Public ordering from a shared product link (PostgreSQL / Supabase).
--
-- Security design: anonymous visitors may NOT insert into public.orders. They
-- call the SECURITY DEFINER function below through RPC, which resolves the
-- product, takes the price from the database (never from the client), creates the
-- customer and order for the correct seller, and returns only the confirmation
-- token. That keeps RLS meaningful: no anon INSERT policy exists on orders.

alter table public.orders
  add column product_id   uuid references public.products (id) on delete set null,
  add column public_token text;

alter table public.order_items
  add column product_id uuid references public.products (id) on delete set null;

create unique index orders_public_token_unique
  on public.orders (public_token)
  where public_token is not null;

create index orders_product_idx on public.orders (product_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.public_order_attempts (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  ip_hash    text not null,
  outcome    text not null check (outcome in ('accepted', 'rejected', 'bot')),
  created_at timestamptz not null default now()
);

create index public_order_attempts_ip_idx
  on public.public_order_attempts (ip_hash, created_at desc);
create index public_order_attempts_product_idx
  on public.public_order_attempts (product_id, created_at desc);

alter table public.public_order_attempts enable row level security;

-- No policies: only the SECURITY DEFINER function below reads or writes it.

------------------------------------------------------------------------------
-- Reference generator (ambiguous characters removed)
------------------------------------------------------------------------------

create or replace function public.generate_order_reference()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  suffix   text := '';
  i        integer;
begin
  for i in 1..6 loop
    suffix := suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'OP-' || suffix;
end;
$$;

------------------------------------------------------------------------------
-- create_public_order
------------------------------------------------------------------------------

create or replace function public.create_public_order(
  p_shop_slug    text,
  p_product_slug text,
  p_name         text,
  p_phone        text,
  p_quantity     integer,
  p_address      text default null,
  p_notes        text default null,
  p_ip_hash      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller   uuid;
  v_product  public.products;
  v_customer uuid;
  v_order    uuid;
  v_reference text;
  v_token    text;
  v_total    bigint;
  v_recent   integer;
  v_name     text := btrim(coalesce(p_name, ''));
  v_phone    text := btrim(coalesce(p_phone, ''));
begin
  -- Rate limit: 5 submissions per product per IP per 15 minutes.
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.public_order_attempts
    where ip_hash = p_ip_hash and created_at > now() - interval '15 minutes';

    if v_recent >= 5 then
      insert into public.public_order_attempts (product_id, ip_hash, outcome)
      values (null, p_ip_hash, 'rejected');
      raise exception 'Too many order attempts. Please try again later.'
        using errcode = 'check_violation';
    end if;
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Enter your name.' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Choose a quantity between 1 and 20.' using errcode = 'check_violation';
  end if;

  -- Resolve the shop and a *published* product; drafts are invisible here.
  select p.id into v_seller
  from public.profiles p
  where p.shop_slug is not null and lower(p.shop_slug) = lower(p_shop_slug);

  if v_seller is null then
    raise exception 'Product not available.' using errcode = 'check_violation';
  end if;

  select * into v_product
  from public.products
  where seller_id = v_seller
    and lower(slug) = lower(p_product_slug)
    and publication_status = 'published';

  if v_product.id is null or v_product.availability <> 'available' then
    raise exception 'Product not available.' using errcode = 'check_violation';
  end if;

  v_total := v_product.price_kobo * p_quantity;

  -- Reuse the customer record for this seller and phone number.
  select id into v_customer
  from public.customers
  where seller_id = v_seller and phone = v_phone;

  if v_customer is null then
    insert into public.customers (seller_id, name, phone, address, notes)
    values (v_seller, v_name, v_phone, nullif(btrim(coalesce(p_address, '')), ''), null)
    returning id into v_customer;
  end if;

  v_reference := public.generate_order_reference();
  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.orders (
    seller_id, customer_id, reference, status, payment_status,
    subtotal_kobo, delivery_fee_kobo, total_kobo, paid_kobo,
    delivery_address, notes, source, product_id, public_token
  ) values (
    v_seller, v_customer, v_reference, 'new', 'unpaid',
    v_total, 0, v_total, 0,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'product_link', v_product.id, v_token
  )
  returning id into v_order;

  insert into public.order_items (
    order_id, seller_id, product_id, description, quantity, unit_price_kobo, line_total_kobo
  ) values (
    v_order, v_seller, v_product.id, v_product.name, p_quantity,
    v_product.price_kobo, v_total
  );

  insert into public.order_events (order_id, seller_id, type, message)
  values (v_order, v_seller, 'created', 'Order placed from a shared product link.');

  if p_ip_hash is not null then
    insert into public.public_order_attempts (product_id, ip_hash, outcome)
    values (v_product.id, p_ip_hash, 'accepted');
  end if;

  return jsonb_build_object(
    'reference', v_reference,
    'token', v_token,
    'total_kobo', v_total
  );
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, integer, text, text, text) from public;
grant execute on function public.create_public_order(text, text, text, text, integer, text, text, text) to anon, authenticated;

-- Public confirmation page lookup: token in, minimal order facts out.
create or replace function public.get_public_order(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reference', o.reference,
    'status', o.status,
    'payment_status', o.payment_status,
    'total_kobo', o.total_kobo,
    'created_at', o.created_at,
    'shop_name', coalesce(p.shop_name, p.business_name),
    'shop_slug', p.shop_slug,
    'shop_phone', p.shop_contact_phone,
    'product_name', i.description,
    'quantity', i.quantity,
    'unit_price_kobo', i.unit_price_kobo
  )
  from public.orders o
  join public.profiles p on p.id = o.seller_id
  join public.order_items i on i.order_id = o.id
  where o.public_token = p_token
  limit 1;
$$;

revoke all on function public.get_public_order(text) from public;
grant execute on function public.get_public_order(text) to anon, authenticated;
