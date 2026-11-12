-- Stream inbox changes to signed-in clients. Realtime enforces RLS, so each
-- user only receives changes to their own rows.
alter publication supabase_realtime add table public.conversations, public.messages, public.notifications;
