-- Shows the events of one calendar (the source) on another calendar (the target), read only.
-- Only the holder of the source calendar key can create or remove a share. Row level security is
-- enabled and no policy exists, exactly as for the other tables.

create table if not exists public.tandem_shares (
  id text primary key,
  source_room text not null references public.tandem_rooms (id) on delete cascade,
  target_room text not null references public.tandem_rooms (id) on delete cascade,
  mode text not null check (mode in ('details', 'busy')),
  label text not null default '',
  by_member text not null default '',
  created_at timestamptz not null default now(),
  unique (source_room, target_room)
);

create index if not exists tandem_shares_target on public.tandem_shares (target_room);

alter table public.tandem_shares enable row level security;
revoke all on public.tandem_shares from anon, authenticated;
