# Integrations: what Orbit can access and why

Researched against primary developer documentation on **2026-11-12**. The full findings, with sources, the changes since mid-2025, and the items we couldn't verify, are in [research/api-landscape-2026-11.md](./research/api-landscape-2026-11.md).

**Ground rules**
- Orbit uses official APIs only. It never scrapes, never automates browser sessions, and never stores account passwords.
- A platform is marked **Live** only when a connector is implemented. **Live** connectors still need your own developer credentials (see `.env.example`). **Without credentials, Orbit shows "Setup required" and never pretends to connect.**
- Where access is restricted, Orbit explains the limitation and offers the supported alternative, usually opening the native app.

## Status

| Platform | Orbit status | Official route | Verdict | Key constraint |
| --- | --- | --- | --- | --- |
| Gmail / Google Workspace | **Live** | Gmail API + Google OAuth | Feasible with restrictions | Read scopes are *restricted*: Google verification plus an annual CASA assessment before public launch. Until then: 100 test users, 7-day authorizations. Limited Use and caching rules apply. |
| Slack | **Live** | Web API, OAuth v2 user token | Feasible with restrictions | Non-Marketplace apps get `conversations.history` at 1 request/min with 15 messages per call. Internal (self-hosted) apps are exempt. |
| Telegram | **Live (Bot API)** | Bot API | Bot: inbox for chats with your bot | The Bot API can't read personal chats or start conversations. Personal chats need MTProto/TDLib (phone login, own `api_id`), which is planned. |
| Outlook / Microsoft 365 | **Live** | Microsoft Graph mail | Fully feasible | `Mail.ReadWrite` and `Mail.Send` need no admin consent and work for personal accounts. Publisher verification is recommended. |
| IMAP / SMTP | **Live** | IMAP4rev2 / SMTP over TLS | Feasible with restrictions | App-specific passwords (iCloud, Fastmail, Yahoo, Zoho, AOL, self-hosted). Gmail and Microsoft require OAuth, so use their connectors. |
| Microsoft Teams | **Live** | Graph chats, delegated | Feasible with restrictions | Work/school accounts only. Polling once per day, so Orbit syncs on change notifications (renewed daily; they last at most 3 days). |
| WhatsApp | **Live (business numbers)** | Business Platform (Cloud API) | Not feasible for personal accounts | Business numbers only. Free-form replies within 24h, then paid templates. No history API. Onboarding *other* businesses needs Meta Tech Provider status (Embedded Signup). |
| Instagram | **Live (professional accounts)** | Instagram API with Instagram Login | Professional accounts only | App Review plus Business Verification. 24h reply window (7 days with Human Agent tag). Only the 20 most recent messages per conversation are readable. |
| Facebook Messenger | **Live (Page inboxes)** | Messenger Platform (Pages) | Page inboxes only | `pages_messaging` App Review, 24h window. Personal Messenger has no API. |
| LinkedIn | Restricted | Partner program | Not feasible | The Messages API is limited to approved partners, and partner access is closed. Orbit offers "Open LinkedIn Messaging". |
| Discord | Restricted | Bot | Not feasible for personal DMs | No OAuth scope exposes user DMs, and self-bots break the ToS. A bot only sees servers it's added to. |

## Implemented connectors

### Gmail (`src/server/connectors/gmail.ts`)
- **Scopes:** `gmail.modify` (read, label, archive, mark read), `gmail.send`, `openid email profile`.
- **Multiple accounts:** each Google account is its own `connected_accounts` row with its own encrypted refresh token, and you pick the sending account per message.
- **Sync:** the first run lists recent threads (`threads.list` → `threads.get`) and records the mailbox `historyId`. Later runs use `history.list` to fetch only touched threads, with a full resync if the id has expired.
- **Push (optional):** `users.watch` → Cloud Pub/Sub → `/api/webhooks/gmail?token=…`. Renewed daily; Google requires renewal at least every 7 days.
- **Quota awareness:** after the 2026-05-01 quota change, `threads.get` costs 40 units (120 for full format). The connector requests `format=full` only for threads that are opened, and uses `metadata` for list sync.
- **Attachments:** downloaded on demand with `messages.attachments.get`. Sending with attachments uses the multipart upload endpoint (up to 35 MB raw; Orbit caps at 25 MB) because the JSON endpoint is limited to 5 MB.
- **Retention:** Google's policy forbids keeping cached copies longer than permitted. Orbit stores message bodies for the retention window set in Settings → Privacy (default 365 days, minimum 1). Deleting an account deletes all of its data.

### Outlook / Microsoft 365 (`src/server/connectors/outlook.ts`)
- **Scopes (delegated):** `User.Read Mail.ReadWrite Mail.Send offline_access`. Works for Outlook.com and work/school accounts.
- **Sync:** Inbox, Sent Items and Archive (last 60 days), grouped into conversations by `conversationId`. Bodies are requested as plain text (`Prefer: outlook.body-content-type="text"`).
- **Replies** use `createReply` + `send`, so Graph returns real message and conversation ids (`sendMail` doesn't), which idempotent sends need. New messages go draft → send.
- **Read / archive** are mirrored: `isRead` is patched, and archive moves messages between Inbox and the well-known Archive folder.
- **Disconnect:** Microsoft has no per-app token revocation endpoint. Orbit deletes its stored tokens and data; users can remove the app at account.microsoft.com (or My Apps for work accounts).
- **Incremental sync** uses Graph delta queries (Inbox and Sent Items) and stores the `deltaLink`.
- **Push:** a change-notification subscription on Inbox messages (`/api/webhooks/outlook`), verified by a per-account `clientState`, renewed daily (mail subscriptions last up to 7 days).
- **Limits:** about 10,000 requests per 10 minutes per mailbox. 429s are retried after `Retry-After`.

### Microsoft Teams (`src/server/connectors/teams.ts`)
- **Scopes (delegated):** `User.Read Chat.ReadWrite ChatMessage.Send offline_access`, via the `organizations` authority (work/school accounts only). Uses the same Microsoft app registration as Outlook, with redirect URI `/api/connectors/teams/callback`. Some tenants require admin consent.
- **Sync:** `/me/chats` (with members and the read viewpoint) and `/chats/{id}/messages`. HTML bodies are converted to text, and system events and deleted messages are skipped.
- **Policy:** Microsoft only allows *polling* Teams messages once per day. Orbit's cron respects that (`minPollIntervalMs`), and new messages arrive through a `/users/{id}/chats/getAllMessages` change subscription (`/api/webhooks/teams`, clientState-verified, renewed daily).
- **Send:** replies post to the chat as you. "New message" creates a 1:1 chat by email address, then sends.

### Slack (`src/server/connectors/slack.ts`)
- **User-token scopes:** `channels:history groups:history im:history mpim:history channels:read groups:read im:read mpim:read users:read chat:write files:read files:write` (+ the `*:write` conversation scopes for marking read).
- **Files:** downloads use `files.info` → `url_private_download` with the user token; uploads use the v2 flow (`files.getUploadURLExternal` → upload → `files.completeUploadExternal`).
- Messages are sent as **you** (user token). Thread replies keep `thread_ts`.
- **Rate limits:** the connector honors `Retry-After` and schedules slow history backfill so the Marketplace throttle never fails a sync. Recent conversations are fetched first.

### IMAP / SMTP (`src/server/connectors/imap.ts`)
- **Credentials:** an app-specific password, encrypted at rest with the other tokens. Orbit never asks for an account's main password. Presets cover iCloud, Fastmail, Yahoo, Zoho and AOL; "Other" takes custom hosts.
- **Connection safety:** hosts are user-supplied, so each one is resolved and rejected if it points at a private, loopback, link-local or metadata address (SSRF protection). TLS is required: IMAPS on 993, and SMTP on 465 (TLS) or 587 (STARTTLS, `requireTLS`). Credentials are verified against both servers before the account is saved.
- **Sync:** recent mail from Inbox, Sent and Archive (special-use folders), parsed with mailparser and threaded by the References/In-Reply-To root Message-ID. Copies of the same message in two folders are deduplicated. There's no IMAP push here; the 5-minute cron picks up new mail.
- **Send:** the RFC 5322 message is composed once, sent over SMTP with threading headers, then appended to Sent (most IMAP servers don't file SMTP mail themselves).
- **Read / archive:** `\Seen` flags and moves to the Archive folder, applied to the whole thread.

### Meta business messaging (`src/server/connectors/meta.ts`)
All three share one webhook, `/api/webhooks/meta`: a GET verify-token handshake, and POSTs that require `X-Hub-Signature-256` (HMAC with the app secret). Reply windows are enforced before calling Meta (`replyMode`): 24 hours after the customer's last message, or 7 days with the Human Agent tag when `META_HUMAN_AGENT_ENABLED=true` and the app holds that permission. Meta's own window errors (Messenger subcode 2018278, WhatsApp 131047) map to clear, non-retryable errors.
- **Messenger (Pages):** Facebook Login for Business (`pages_show_list pages_messaging pages_manage_metadata pages_read_engagement business_management`). A long-lived user token yields non-expiring Page tokens, and **every Page you select becomes its own account**. Each Page is subscribed to the app's `messages,message_echoes` webhooks. History comes from the Conversations API.
- **Instagram (professional accounts):** Instagram Login (`instagram_business_basic instagram_business_manage_messages`) with 60-day long-lived tokens, refreshed automatically. History is limited by Instagram to the 20 most recent messages per conversation.
- **WhatsApp (Cloud API):** connect your own business number with a system-user token and phone number ID (Settings → Accounts). There's no history endpoint, so conversations start from webhooks. Delivered/read **receipts update message status** and never downgrade. Media downloads go through the Media API, and documents up to 16 MB can be sent. Starting conversations (templates) isn't supported.
- Messenger and Instagram conversations are keyed by the customer's scoped id (PSID / IGSID), so webhook events and synced history always land in the same conversation.
- `META_GRAPH_VERSION` defaults to `v24.0`. Set it to the version your app is pinned to.

### Telegram Bot (`src/server/connectors/telegram.ts`)
- Files: `sendDocument` for uploads (50 MB) and `getFile` for downloads (bots can download up to 20 MB).
- Connect by pasting a bot token from @BotFather. Orbit validates it with `getMe` and registers a webhook with a secret token.
- The inbox shows chats people start with the bot. Replies go out as the bot. The UI disables "New conversation" because bots can't start chats.

## Why some platforms show sample conversations

The demo workspace includes WhatsApp, LinkedIn, Instagram and personal Telegram conversations so the design can be judged with realistic data. All demo sends are simulated by `DemoTransport` and labeled as such.

- **Personal WhatsApp, personal Instagram, personal Telegram and LinkedIn** samples are **Preview only**: their composers are disabled, with the real limitation and a link to the native app. This is exactly what a connected user would see, because those APIs don't exist for personal accounts.
- **Business WhatsApp and Business Instagram** samples show the 24-hour customer-service window those APIs enforce: replies are allowed inside the window and blocked outside it.
