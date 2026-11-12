# Orbit architecture

Orbit is a unified communication workspace: one inbox for every conversation, across every connected account. This document covers the application structure, the connector model, the data model, and the guarantees the product makes.

## 1. Application structure

```
src/
  app/                    Next.js App Router (v16) — pages + route handlers
    (workspace)/          Authenticated three-panel workspace (inbox, contacts, follow-ups, analytics, assistant, settings)
    onboarding/           First-run flow
    api/                  Route handlers: auth callbacks, connectors, sync, messages, AI
  components/
    ui/                   Design-system primitives (Radix-based, token-driven)
    shell/                App shell, sidebar, global overlays
    inbox/                Conversation list, conversation views, composer
    …                     Feature modules (compose, command, contacts, followups, analytics, assistant, settings)
  lib/
    types.ts              Domain model shared by client + server
    platforms.ts          Platform registry: capabilities, support level, limitations
    intelligence/         Deterministic prioritization, follow-up detection, briefing, analytics
    search.ts             Natural-language query parser + ranked search
    demo/seed.ts          Sample workspace (always flagged isDemo)
  store/
    workspace.ts          Zustand store: data + actions (persisted locally in demo mode)
    transport.ts          Message transports (demo simulation vs. live API)
    selectors.ts          Derived data: priority, folder views, unread counts
  server/
    connectors/           One adapter per provider behind a common interface
    crypto.ts             AES-256-GCM token encryption
    supabase.ts           Server clients (RLS-scoped user client + service client for jobs)
supabase/migrations/      PostgreSQL schema, indexes, Row Level Security
```

### Workspace modes

| Mode    | Data source                                   | Labeled as                     |
| ------- | --------------------------------------------- | ------------------------------ |
| `empty` | Nothing connected                             | Empty states with connect CTAs |
| `demo`  | `lib/demo/seed.ts`, persisted to localStorage | "Sample workspace" everywhere  |
| `live`  | Supabase + real connectors via `/api/*`       | Real account names             |

Demo and live data never mix. Every demo record carries `isDemo: true`. The sidebar shows a persistent "Sample workspace" notice, and demo sends go through `DemoTransport`, which says it is a simulation.

## 2. Connector architecture

Every provider is an adapter implementing one interface (`src/server/connectors/types.ts`):

```ts
interface Connector {
  platform: PlatformId;
  isConfigured(): boolean;                       // required env present?
  getAuthorizationUrl?(state, redirectUri): string;
  exchangeCode?(code, redirectUri): Promise<ConnectedIdentity>;
  refresh?(tokens): Promise<TokenSet>;
  listConversations(ctx, cursor?): Promise<Page<NormalizedConversation>>;
  listMessages(ctx, externalConversationId, cursor?): Promise<Page<NormalizedMessage>>;
  send(ctx, input: OutboundMessage): Promise<{ externalId: string; sentAt: string }>;
  markRead?(ctx, externalConversationId): Promise<void>;
  verifyWebhook?(req): Promise<boolean>;
  handleWebhook?(payload): Promise<NormalizedEvent[]>;
}
```

**Capability detection.** `lib/platforms.ts` declares each platform's `Capabilities` (read, send, reply, compose, attachments, threads, subjects, recipients, …). Accounts can narrow them further with `capabilityOverrides`; a Telegram bot, for example, can reply but can't start conversations. The UI reads capabilities through `accountCapabilities()` and never renders an enabled action the connector can't perform. Where an action is unsupported, it explains why and offers the supported alternative (usually "Open in <native app>").

**Support levels** (`live` / `planned` / `restricted`) are shown in onboarding and settings exactly as they are. A platform is only `live` when its connector is implemented. See [INTEGRATIONS.md](./INTEGRATIONS.md) for each provider's API constraints.

## 3. Sending guarantees

1. The composer creates a `clientId` (idempotency key) before the first attempt.
2. The message appears immediately with status `pending` ("Sending…"). It is never shown as sent at this stage.
3. The transport sends it. Only a confirmed provider response flips it to `sent`.
4. On failure, the message shows `failed` with the provider's error and a **Retry** action. Retries reuse the same `clientId`:
   - client side, the in-flight map dedupes double clicks;
   - server side, `messages (user_id, client_id)` is unique, so a retry after an ambiguous timeout returns the original result instead of sending twice.
5. Undo-send: the composer holds outbound messages for a configurable window (default 5s) before dispatching.

## 4. Live persistence

In live mode, `LiveBridge` (`src/components/live/live-bridge.tsx`) subscribes to the store, diffs each change with the pure functions in `src/lib/live-diff.ts`, and writes it through a debounced, coalescing outbox:

| Change | Endpoint |
| --- | --- |
| Star, pin, archive, read, snooze, mute | `PATCH /api/conversations/:id` (mirrored to Gmail/Slack where supported) |
| Labels on a conversation | `PUT /api/conversations/:id/labels` |
| Account label, AI access, notifications, default sender, pause | `PATCH /api/accounts/:id` |
| Reminders, notes, labels, drafts, scheduled messages, priority rules, contact edits | `POST /api/data/:collection` (batched upserts + deletes, Zod-validated, RLS-scoped) |
| Contact merge / unmerge | `POST /api/contacts/merge`, `POST /api/contacts/unmerge` |
| Preferences | `PUT /api/preferences` |

Records that can be persisted use client-generated UUIDs, so optimistic local state and server rows share ids. Polling skips a refresh while writes are pending, so a slow save can't be overwritten by stale data.

**Contact unification.** During sync, every participant resolves to a contact through an exact identity: an email address (platform-agnostic), a team-scoped Slack user, or a Telegram user id (`src/server/identity.ts`). Display names are never used for matching. Merges are reversible: identities remember `original_contact_id`, and the secondary contact stays, pointing at its primary through `merged_into`.

## 5. Sync

- **Incremental by default.** Connectors that support it sync only what changed: Gmail through `history.list` from the stored `historyId` (falling back to a full list when Google has expired the id), Outlook through Graph delta queries with a per-folder `deltaLink` (resuming long first enumerations). Cursors live in `connected_accounts.sync_cursor`.
- **Push.** With `ORBIT_PUBLIC_URL` set, each sync also creates or renews provider push: Gmail `users.watch` → Pub/Sub → `/api/webhooks/gmail` (token-verified), and Outlook subscriptions → `/api/webhooks/outlook` (validation handshake plus a per-account `clientState`). Slack Events and Telegram webhooks are verified by signature and secret token. Each push triggers an incremental sync after the response.
- **Realtime to the browser.** `conversations`, `messages` and `notifications` are in the Supabase Realtime publication (RLS-enforced). The client coalesces bursts into one refresh, reloads open threads, and surfaces notifications through the DND, quiet-hours and priority policy. Polling drops to every 5 minutes as a safety net.
- **Cron** (`/api/cron/sync`, every 5 minutes): catches anything push missed, renews subscriptions, sends due scheduled messages, applies retention and records unread snapshots.
- **Retries & rate limits:** connector errors are typed (`AuthError`, `RateLimitError` with `retryAfter`, `TransientError`). Rate-limited jobs are rescheduled after `Retry-After`. Auth errors move the account to `needs_reauth` and create a notification with a Reconnect action.

## 6. Security

- **OAuth only.** Orbit never asks for or stores account passwords.
- **Tokens are encrypted at rest** (AES-256-GCM, key from `ORBIT_TOKEN_ENCRYPTION_KEY`) in `connected_accounts.encrypted_tokens`. They're decrypted only inside route handlers and never sent to the browser.
- **Row Level Security** on every user-owned table: `user_id = auth.uid()`. Background jobs use the service role, scoped by explicit `user_id` filters.
- **OAuth `state`** is a signed, short-lived value bound to the user session, which prevents CSRF on callbacks.
- **Webhooks** are verified (Slack signing secret, Telegram secret token header, Meta `X-Hub-Signature-256`).
- **Audit log**: account connect, disconnect, data deletion and AI-permission changes are written to `audit_logs`.

## 7. Data model

Normalized PostgreSQL schema (`supabase/migrations/0001_init.sql`):

`users` (Supabase auth) · `platforms` · `connected_accounts` · `contacts` · `contact_identities` · `conversations` · `conversation_participants` · `messages` · `attachments` · `labels` · `conversation_labels` · `notes` · `reminders` · `tasks` · `drafts` · `scheduled_messages` · `notifications` · `notification_rules` · `priority_rules` · `sync_jobs` · `user_preferences` · `audit_logs`

Key decisions:
- `conversations (account_id, external_id)` and `messages (conversation_id, external_id)` are unique, so syncs are idempotent upserts.
- Contact identity is a separate `contact_identities` table (platform + handle). Merging contacts moves identities; unmerging moves them back. **Orbit never merges automatically on name alone.** Merge suggestions require a matching email address or phone number and always need user confirmation.
- Full-text search: `messages.search_vector` (generated `tsvector`) with a GIN index.

## 8. Intelligence

Two layers:

1. **Deterministic signals** (`lib/intelligence/*`): priority scoring with human-readable reasons, follow-up detection (needs reply, waiting on them, your commitments, their deadlines), and the daily briefing assembly. These run on synced data, are unit-tested, and work without any LLM.
2. **LLM features** (`/api/ai/*`): summaries, smart replies, the natural-language assistant and briefing prose. They're server-side only and receive only conversations from accounts where `ai_enabled = true`. AI never sends messages; every suggestion lands in an editable composer.

## 9. Design system

See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).
