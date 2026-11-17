-- Reminders. A device that asks for reminders is stored here, together with the calendars it belongs to and the
-- personal rules that silence an event. The scheduler calls the reminder function once a minute.
-- Row level security is enabled and no policy exists, so only the edge functions can reach these tables.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.tandem_push (
  id text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  tz text not null default 'Europe/London',
  lead integer not null default 10,
  rooms jsonb not null default '[]'::jsonb,
  rules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row for each reminder already sent, so that nobody is told twice about the same event.
create table if not exists public.tandem_push_sent (
  sub text not null references public.tandem_push (id) on delete cascade,
  k text not null,
  at timestamptz not null default now(),
  primary key (sub, k)
);
create index if not exists tandem_push_sent_at on public.tandem_push_sent (at);

-- Server settings, including the key that signs push messages. Never exposed to the application.
create table if not exists public.tandem_config (
  key text primary key,
  value text not null
);

alter table public.tandem_push enable row level security;
alter table public.tandem_push_sent enable row level security;
alter table public.tandem_config enable row level security;
revoke all on public.tandem_push from anon, authenticated;
revoke all on public.tandem_push_sent from anon, authenticated;
revoke all on public.tandem_config from anon, authenticated;

-- Once a minute, ask the reminder function to send whatever is due. The shared secret is read from tandem_config.
select cron.schedule(
  'tandem-push-tick',
  '* * * * *',
  $$select net.http_post(
      url := 'https://dpfeyzxfccxferiwvgrc.supabase.co/functions/v1/tandem-push/tick',
      headers := jsonb_build_object('content-type', 'application/json', 'x-tick-secret', (select value from public.tandem_config where key = 'tick_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000)$$
);
