-- Live-mode persistence for user-authored data + contact unification.

-- Email and phone identities are platform-agnostic (the same address on Gmail and
-- Outlook is one person), so platform_id is NULL for them. Treat NULLs as equal
-- in the uniqueness check so the same address can't be claimed twice.
alter table public.contact_identities drop constraint if exists contact_identities_user_id_kind_platform_id_value_key;
alter table public.contact_identities add constraint contact_identities_unique_value unique nulls not distinct (user_id, kind, platform_id, value);

-- Merges are reversible: the secondary contact stays, pointing at the primary.
alter table public.contacts add column if not exists merged_into uuid references public.contacts(id) on delete set null;
alter table public.contacts add column if not exists avatar_hue int not null default 200;
create index if not exists contacts_merged_into_idx on public.contacts (merged_into);

-- Notes are keyed by conversation; keep a user index for workspace loads.
create index if not exists notes_user_idx on public.notes (user_id);
create index if not exists drafts_user_idx on public.drafts (user_id, updated_at desc);
create index if not exists priority_rules_user_idx on public.priority_rules (user_id);

-- Scheduled messages: client_id doubles as the idempotency key for the eventual send.
create index if not exists scheduled_user_idx on public.scheduled_messages (user_id, status, send_at);

-- Human-readable form of an identity (e.g. "@priya" for a Slack user id).
alter table public.contact_identities add column if not exists display text;
