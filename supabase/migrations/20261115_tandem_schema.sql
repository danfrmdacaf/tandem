-- Tandem shared calendar schema.
-- Row level security is enabled and no policies are created, so the public roles cannot read or write
-- anything. Only the edge function, which runs with the service role on the server, touches these tables.

create table if not exists public.tandem_rooms (
  id text primary key,
  secret_hash text not null,
  feed_token text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tandem_items (
  room text not null references public.tandem_rooms (id) on delete cascade,
  kind text not null check (kind in ('meta', 'member', 'event')),
  id text not null,
  data jsonb not null default '{}'::jsonb,
  v bigint not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room, kind, id)
);

create index if not exists tandem_items_room_updated on public.tandem_items (room, updated_at);

create table if not exists public.tandem_links (
  code text primary key,
  room text not null references public.tandem_rooms (id) on delete cascade,
  key text not null,
  expires_at timestamptz not null
);

alter table public.tandem_rooms enable row level security;
alter table public.tandem_items enable row level security;
alter table public.tandem_links enable row level security;

revoke all on public.tandem_rooms from anon, authenticated;
revoke all on public.tandem_items from anon, authenticated;
revoke all on public.tandem_links from anon, authenticated;
