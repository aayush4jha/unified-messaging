-- Web Push subscriptions: one row per installed device / browser that turned on notifications.
-- Written only by the server (service role) after authenticating the user, because an endpoint can
-- move between accounts on a shared device. Users can see and remove their own.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  time_zone text,            -- IANA zone, so quiet hours are evaluated in the device's local time
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own rows: select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own rows: delete" on public.push_subscriptions for delete using (user_id = auth.uid());
