-- Give every product a distinct discovery salt (see 0018).

update public.products
   set discovery_salt = floor(random() * 1000000)::int
 where discovery_salt = 0;
