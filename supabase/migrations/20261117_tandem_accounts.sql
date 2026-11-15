-- Optional accounts for Tandem. A person can still use Tandem with no account; an account only exists so that
-- calendars, Home page layout and preferences follow the person to every device. Row level security is
-- enabled and no policy exists, so only the edge function (service role, on the server) can read or write.

create table if not exists public.tandem_accounts (
  id text primary key,
  email text not null unique,
  name text not null default '',
  pw_hash text not null,
  pw_salt text not null,
  pw_iter integer not null,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only a hash of each session token is stored.
create table if not exists public.tandem_sessions (
  id text primary key,
  account text not null references public.tandem_accounts (id) on delete cascade,
  device text not null default '',
  created_at timestamptz not null default now(),
  last_used timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists tandem_sessions_account on public.tandem_sessions (account);

-- Only a hash of each reset token is stored. A token works once and expires after one hour.
create table if not exists public.tandem_resets (
  token_hash text primary key,
  account text not null references public.tandem_accounts (id) on delete cascade,
  expires_at timestamptz not null
);

-- Counts attempts so that guessing passwords or requesting many emails is slowed down.
create table if not exists public.tandem_attempts (
  id bigint generated always as identity primary key,
  k text not null,
  at timestamptz not null default now()
);
create index if not exists tandem_attempts_k on public.tandem_attempts (k, at);

-- Ticket files that belong to one account.
create table if not exists public.tandem_files (
  id text primary key,
  account text not null references public.tandem_accounts (id) on delete cascade,
  name text not null,
  type text not null,
  size integer not null,
  data text not null,
  created_at timestamptz not null default now()
);
create index if not exists tandem_files_account on public.tandem_files (account);

alter table public.tandem_accounts enable row level security;
alter table public.tandem_sessions enable row level security;
alter table public.tandem_resets enable row level security;
alter table public.tandem_attempts enable row level security;
alter table public.tandem_files enable row level security;

revoke all on public.tandem_accounts from anon, authenticated;
revoke all on public.tandem_sessions from anon, authenticated;
revoke all on public.tandem_resets from anon, authenticated;
revoke all on public.tandem_attempts from anon, authenticated;
revoke all on public.tandem_files from anon, authenticated;
