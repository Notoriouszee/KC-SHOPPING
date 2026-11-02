-- Image dimensions for social previews (PostgreSQL / Supabase).

alter table public.product_images
  add column width  integer,
  add column height integer;

comment on column public.product_images.width is
  'Pixel width measured at upload; used for og:image:width.';
comment on column public.product_images.height is
  'Pixel height measured at upload; used for og:image:height.';
