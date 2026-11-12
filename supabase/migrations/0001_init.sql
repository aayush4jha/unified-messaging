-- Orbit schema
-- Every user-owned table carries user_id and is protected by Row Level Security:
-- a signed-in user can only ever see or change their own rows. Background jobs
-- use the service role and always filter by user_id explicitly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- platforms (reference data)
create table public.platforms (
  id text primary key,                 -- 'gmail', 'slack', 'telegram', ...
  name text not null,
  category text not null check (category in ('email','messaging','professional','social')),
  support text not null check (support in ('live','planned','restricted'))
);
insert into public.platforms (id, name, category, support) values
  ('gmail','Gmail','email','live'),
  ('outlook','Outlook','email','planned'),
  ('imap','Other email (IMAP)','email','planned'),
  ('slack','Slack','professional','live'),
  ('teams','Microsoft Teams','professional','planned'),
  ('telegram','Telegram','messaging','live'),
  ('whatsapp','WhatsApp','messaging','restricted'),
  ('discord','Discord','messaging','restricted'),
  ('linkedin','LinkedIn','professional','restricted'),
  ('instagram','Instagram','social','restricted'),
  ('messenger','Messenger','social','restricted');
alter table public.platforms enable row level security;
create policy "platforms are readable" on public.platforms for select using (true);

-- ---------------------------------------------------------------- user preferences
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  ai_enabled boolean not null default true,
  retention_days int not null default 365 check (retention_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- connected accounts
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id text not null references public.platforms(id),
  external_account_id text not null,          -- Google sub, Slack team+user, Telegram bot id
  label text not null,
  handle text not null,                       -- email address, workspace domain, @bot
  status text not null default 'connected' check (status in ('connected','syncing','needs_reauth','error','paused')),
  status_message text,
  -- AES-256-GCM ciphertext (see src/server/crypto.ts). Never selected by client-facing queries.
  encrypted_tokens text not null,
  scopes text[] not null default '{}',
  is_default_sender boolean not null default false,
  ai_enabled boolean not null default true,
  notifications_enabled boolean not null default true,
  capability_overrides jsonb not null default '{}'::jsonb,
  sync_cursor jsonb not null default '{}'::jsonb,   -- historyId, Slack cursors, Telegram offsets
  webhook_secret text,                              -- per-account secret for inbound webhooks
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform_id, external_account_id)
);
create index connected_accounts_user_idx on public.connected_accounts (user_id);

-- Column-level protection: signed-in users can read and edit only these columns of their own
-- rows. Token ciphertext and webhook secrets are readable/writable by the service role only.
revoke all on public.connected_accounts from anon, authenticated;
grant select (id, user_id, platform_id, external_account_id, label, handle, status, status_message, scopes,
              is_default_sender, ai_enabled, notifications_enabled, capability_overrides, last_synced_at, created_at)
  on public.connected_accounts to authenticated;
grant update (label, is_default_sender, ai_enabled, notifications_enabled, status)
  on public.connected_accounts to authenticated;
grant delete on public.connected_accounts to authenticated;

-- ---------------------------------------------------------------- contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text,
  title text,
  notes text not null default '',
  vip boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_user_idx on public.contacts (user_id);

-- One row per address/handle. Merging contacts re-points identities; unmerging restores them.
create table public.contact_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  original_contact_id uuid,                   -- set when merged, used to unmerge
  kind text not null check (kind in ('email','phone','handle')),
  platform_id text references public.platforms(id),
  value text not null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  unique (user_id, kind, platform_id, value)
);
create index contact_identities_contact_idx on public.contact_identities (contact_id);

-- ---------------------------------------------------------------- conversations & messages
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  external_id text not null,                  -- Gmail threadId, Slack channel id, Telegram chat id
  kind text not null check (kind in ('email','dm','group','channel')),
  title text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  last_message_at timestamptz not null,
  last_author text,                           -- 'me' or participant external id
  preview text not null default '',
  unread_count int not null default 0,
  message_count int not null default 0,
  has_attachments boolean not null default false,
  starred boolean not null default false,
  pinned boolean not null default false,
  important boolean not null default false,
  archived boolean not null default false,
  muted boolean not null default false,
  snoozed_until timestamptz,
  category text not null default 'personal' check (category in ('personal','professional','work')),
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index conversations_inbox_idx on public.conversations (user_id, archived, last_message_at desc);
create index conversations_account_idx on public.conversations (account_id, last_message_at desc);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  name text not null,
  handle text,
  contact_id uuid references public.contacts(id) on delete set null,
  primary key (conversation_id, external_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  external_id text,                           -- null while an outbound message is pending
  client_id text,                             -- idempotency key for outbound sends
  author_external_id text not null,           -- 'me' for the account owner
  author_name text,
  subject text,
  body text not null default '',
  body_html text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  status text not null default 'delivered' check (status in ('pending','sent','delivered','read','failed')),
  error text,
  sent_at timestamptz not null,
  thread_external_id text,                    -- Slack thread_ts, email In-Reply-To
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(subject, '')), 'A') || setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  unique (conversation_id, external_id),
  unique (user_id, client_id)                 -- a retried send can never create a second message
);
create index messages_conversation_idx on public.messages (conversation_id, sent_at);
create index messages_search_idx on public.messages using gin (search_vector);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  external_id text,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  storage_path text                           -- Supabase Storage object (fetched lazily)
);
create index attachments_message_idx on public.attachments (message_id);

-- ---------------------------------------------------------------- organization
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hue int not null default 200,
  unique (user_id, name)
);

create table public.conversation_labels (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (conversation_id, label_id)
);

create table public.notes (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reminder','follow_up','task','awaiting_response')),
  title text not null,
  note text,
  conversation_id uuid references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  source text not null default 'user' check (source in ('user','suggestion')),
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (user_id, completed_at, due_at);

-- Tasks created from messages (separate from reminders so they can carry richer state later)
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message_id uuid references public.messages(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  to_addrs text[] not null default '{}',
  subject text,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  client_id text not null,
  to_addrs text[] not null default '{}',
  subject text,
  body text not null,
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','failed','cancelled')),
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index scheduled_due_idx on public.scheduled_messages (status, send_at);

-- ---------------------------------------------------------------- notifications & rules
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message','priority','reminder','system')),
  title text not null,
  body text not null default '',
  conversation_id uuid references public.conversations(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.priority_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sender','keyword','account','platform')),
  value text not null,
  effect text not null check (effect in ('boost','lower')),
  enabled boolean not null default true
);

-- Daily unread snapshot, so analytics can show an honest unread trend over time.
create table public.unread_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  unread_conversations int not null,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------- sync & audit
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  kind text not null check (kind in ('initial','incremental','webhook','send')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','retrying')),
  attempts int not null default 0,
  next_run_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index sync_jobs_due_idx on public.sync_jobs (status, next_run_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,                       -- 'account.connect', 'account.disconnect', 'ai.toggle', 'data.delete'
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

-- ---------------------------------------------------------------- Row Level Security
do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences','connected_accounts','contacts','contact_identities','conversations',
    'conversation_participants','messages','attachments','labels','conversation_labels','notes',
    'reminders','tasks','drafts','scheduled_messages','notifications','priority_rules',
    'unread_snapshots','sync_jobs','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows: select" on public.%I for select using (user_id = auth.uid())', t);
    execute format('create policy "own rows: insert" on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('create policy "own rows: update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows: delete" on public.%I for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Audit logs are append-only for users.
drop policy "own rows: update" on public.audit_logs;
drop policy "own rows: delete" on public.audit_logs;
-- Tokens are only ever written by the server (service role).
drop policy "own rows: insert" on public.connected_accounts;

-- Keep conversation summary columns in sync when messages arrive.
create or replace function public.touch_conversation() returns trigger language plpgsql as $$
begin
  update public.conversations c set
    last_message_at = greatest(c.last_message_at, new.sent_at),
    preview = case when new.sent_at >= c.last_message_at then left(regexp_replace(new.body, '\s+', ' ', 'g'), 180) else c.preview end,
    last_author = case when new.sent_at >= c.last_message_at then new.author_external_id else c.last_author end,
    message_count = c.message_count + 1
  where c.id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch_conversation after insert on public.messages for each row execute function public.touch_conversation();

-- Atomic unread increment for webhook ingestion (service role only).
create or replace function public.increment_unread(conv_id uuid) returns void language sql security definer set search_path = public as $$
  update public.conversations set unread_count = unread_count + 1, archived = false where id = conv_id;
$$;
revoke execute on function public.increment_unread(uuid) from public, anon, authenticated;
