-- Sign-in attempt tracking (PostgreSQL / Supabase).
--
-- Written only by the auth path (service role); no client access at all.

create table public.auth_attempts (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  ip_hash    text not null,
  outcome    text not null check (outcome in ('failed', 'blocked')),
  created_at timestamptz not null default now()
);

create index auth_attempts_key_idx on public.auth_attempts (key, created_at desc);
create index auth_attempts_ip_idx on public.auth_attempts (ip_hash, created_at desc);

alter table public.auth_attempts enable row level security;

-- No policies: nobody but the server touches this table.

comment on column public.auth_attempts.key is
  'Daily-salted hash of IP + email. Never stores the email itself.';
