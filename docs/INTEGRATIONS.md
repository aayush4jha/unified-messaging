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
| IMAP / SMTP | Planned | IMAP4rev2 / SMTP, XOAUTH2 | Feasible with restrictions | Gmail and Microsoft require OAuth. App passwords work only where the provider still offers them. |
| Microsoft Teams | Planned | Graph chats, delegated | Feasible with restrictions | Work/school accounts only. Polling once per day, so change notifications are needed (renewed every 3 days). |
| WhatsApp | Restricted | Business Platform (Cloud API) | Not feasible for personal accounts | Business numbers only. Free-form replies within 24h, then paid templates. Coexistence requires Meta Tech Provider status. |
| Instagram | Restricted | Instagram API with Instagram Login | Professional accounts only | App Review plus Business Verification. 24h reply window (7 days with Human Agent tag). Only the 20 most recent messages per conversation are readable. |
| Facebook Messenger | Restricted | Messenger Platform (Pages) | Page inboxes only | `pages_messaging` App Review, 24h window. Personal Messenger has no API. |
| LinkedIn | Restricted | Partner program | Not feasible | The Messages API is limited to approved partners, and partner access is closed. Orbit offers "Open LinkedIn Messaging". |
| Discord | Restricted | Bot | Not feasible for personal DMs | No OAuth scope exposes user DMs, and self-bots break the ToS. A bot only sees servers it's added to. |

## Implemented connectors

### Gmail (`src/server/connectors/gmail.ts`)
- **Scopes:** `gmail.modify` (read, label, archive, mark read), `gmail.send`, `openid email profile`.
- **Multiple accounts:** each Google account is its own `connected_accounts` row with its own encrypted refresh token, and you pick the sending account per message.
- **Sync:** `threads.list` → `threads.get` (metadata + plain-text body), then incremental sync via `history.list` from the stored `historyId`. Push via `users.watch` → Pub/Sub is supported, and needs renewing every ≤7 days (handled by the cron job).
- **Quota awareness:** after the 2026-05-01 quota change, `threads.get` costs 40 units (120 for full format). The connector requests `format=full` only for threads that are opened, and uses `metadata` for list sync.
- **Attachments:** downloaded on demand with `messages.attachments.get`. Sending with attachments uses the multipart upload endpoint (up to 35 MB raw; Orbit caps at 25 MB) because the JSON endpoint is limited to 5 MB.
- **Retention:** Google's policy forbids keeping cached copies longer than permitted. Orbit stores message bodies for the retention window set in Settings → Privacy (default 365 days, minimum 1). Deleting an account deletes all of its data.

### Outlook / Microsoft 365 (`src/server/connectors/outlook.ts`)
- **Scopes (delegated):** `User.Read Mail.ReadWrite Mail.Send offline_access`. Works for Outlook.com and work/school accounts.
- **Sync:** Inbox, Sent Items and Archive (last 60 days), grouped into conversations by `conversationId`. Bodies are requested as plain text (`Prefer: outlook.body-content-type="text"`).
- **Replies** use `createReply` + `send`, so Graph returns real message and conversation ids (`sendMail` doesn't), which idempotent sends need. New messages go draft → send.
- **Read / archive** are mirrored: `isRead` is patched, and archive moves messages between Inbox and the well-known Archive folder.
- **Disconnect:** Microsoft has no per-app token revocation endpoint. Orbit deletes its stored tokens and data; users can remove the app at account.microsoft.com (or My Apps for work accounts).
- **Limits:** about 10,000 requests per 10 minutes per mailbox. 429s are retried after `Retry-After`. Change notifications (webhooks) are planned; for now the 5-minute cron catches new mail.

### Slack (`src/server/connectors/slack.ts`)
- **User-token scopes:** `channels:history groups:history im:history mpim:history channels:read groups:read im:read mpim:read users:read chat:write files:read files:write` (+ the `*:write` conversation scopes for marking read).
- **Files:** downloads use `files.info` → `url_private_download` with the user token; uploads use the v2 flow (`files.getUploadURLExternal` → upload → `files.completeUploadExternal`).
- Messages are sent as **you** (user token). Thread replies keep `thread_ts`.
- **Rate limits:** the connector honors `Retry-After` and schedules slow history backfill so the Marketplace throttle never fails a sync. Recent conversations are fetched first.

### Telegram Bot (`src/server/connectors/telegram.ts`)
- Files: `sendDocument` for uploads (50 MB) and `getFile` for downloads (bots can download up to 20 MB).
- Connect by pasting a bot token from @BotFather. Orbit validates it with `getMe` and registers a webhook with a secret token.
- The inbox shows chats people start with the bot. Replies go out as the bot. The UI disables "New conversation" because bots can't start chats.

## Why some platforms show sample conversations

The demo workspace includes WhatsApp, LinkedIn, Instagram and personal Telegram conversations so the design can be judged with realistic data. All demo sends are simulated by `DemoTransport` and labeled as such.

- **Personal WhatsApp, personal Instagram, personal Telegram and LinkedIn** samples are **Preview only**: their composers are disabled, with the real limitation and a link to the native app. This is exactly what a connected user would see for an unsupported capability.
- **Business WhatsApp and Business Instagram** samples show the 24-hour customer-service window those APIs enforce: replies are allowed inside the window and blocked outside it.
