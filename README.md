# Orbit

**One inbox. Every conversation. Every account. One workspace.**

Orbit is a unified communication workspace. It brings email, work chat and messaging into one keyboard-first interface: multiple Gmail and Outlook accounts, Microsoft Teams, Slack workspaces and Telegram bots, with an assistant that briefs you, summarizes threads and drafts replies. It never sends anything on its own.

## Quick start (sample workspace)

```bash
npm install
npm run dev          # http://localhost:3000
```

With no configuration, Orbit runs as a **sample workspace**: 12 sample accounts and realistic conversations, all clearly labeled. Every interaction works locally, sends are simulated, and no data leaves your browser.

## Live accounts

1. **Supabase.** Create a project and run the migrations in [`supabase/migrations/`](supabase/migrations) in order (`0001` → `0006`) in the SQL editor. They create the schema, indexes and Row Level Security. Enable Email (magic link) auth.
2. **Environment.** Copy [`.env.example`](.env.example) to `.env.local` and fill it in. At minimum you need the Supabase keys, `ORBIT_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) and `ORBIT_PUBLIC_URL`.
3. **Connectors.**
   - **Gmail**: create a Google OAuth client and enable the Gmail API. Add `${ORBIT_PUBLIC_URL}/api/connectors/gmail/callback` as a redirect URI. While the app is unverified, add yourself as a test user.
   - **Outlook / Microsoft 365**: register an app in the Entra admin center for "any organizational directory and personal Microsoft accounts". Add the redirect URI `${ORBIT_PUBLIC_URL}/api/connectors/outlook/callback` and the delegated permissions `User.Read Mail.ReadWrite Mail.Send offline_access`.
   - **Microsoft Teams**: in the same app registration, add the redirect URI `${ORBIT_PUBLIC_URL}/api/connectors/teams/callback` and the delegated permissions `Chat.ReadWrite ChatMessage.Send`. These cover work/school accounts only, and some organizations require admin consent.
   - **Slack**: create an app with the user scopes listed in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md), set the redirect URL, and point Event Subscriptions to `/api/webhooks/slack`.
   - **WhatsApp / Messenger / Instagram (business accounts)**: create a Meta app and set the webhook to `/api/webhooks/meta` with your verify token (see `.env.example`). Messenger and Instagram use OAuth. For WhatsApp, paste a system-user token and phone number ID in Settings. Production use needs Meta App Review.
   - **Telegram**: no app setup. Paste a bot token from @BotFather in Settings → Accounts.
4. **Real time.** Run `0004_realtime.sql` so the inbox updates live via Supabase Realtime. With `ORBIT_PUBLIC_URL` set, Orbit also registers provider push: Outlook change notifications automatically, Gmail via Pub/Sub (see `.env.example`), and Slack/Telegram webhooks.
5. **Background sync.** [`vercel.json`](vercel.json) schedules `/api/cron/sync` every 5 minutes (set `CRON_SECRET`). On other hosts, call it with `Authorization: Bearer $CRON_SECRET`.
6. **AI (optional).** Set `ANTHROPIC_API_KEY`. Without it, briefings and assistant answers use Orbit's rules and say so.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (search, prioritization, follow-ups, analytics, crypto, OAuth state, Gmail/Slack/Telegram parsing) |
| `npm run test:e2e` | Playwright end-to-end journeys against the sample workspace |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |

## Status

| Area | State |
| --- | --- |
| Workspace UI (inbox, conversation views, compose, search, ⌘K, contacts, follow-ups, analytics, settings, onboarding, notifications) | Built and exercised end-to-end on the sample workspace |
| Rule-based intelligence (priority, follow-ups, deadlines, briefing, NL search) | Built and unit-tested |
| Live persistence of notes, reminders, labels, drafts, scheduled messages, priority rules, preferences and contacts (with reversible merges) | Built. Diffing is unit-tested. **Not yet exercised against a live Supabase project** |
| Gmail / Outlook / Teams / Slack / Telegram / WhatsApp Business / Messenger Pages / Instagram professional connectors, OAuth, encrypted tokens, sync, webhooks, idempotent send | Built. Parsing, signing and crypto are unit-tested. **Not yet exercised against live provider accounts** (needs your credentials) |
| AI (summaries, smart replies, assistant, briefing prose) | Built on the Anthropic SDK with structured outputs. **Not yet exercised against the live API** (needs `ANTHROPIC_API_KEY`) |
| IMAP | Planned. The official APIs allow it ([details](docs/INTEGRATIONS.md)) |
| Personal WhatsApp/Instagram/Messenger, LinkedIn, Discord DMs | Not possible through official APIs. Orbit explains why and links to the native app |

Known gaps in live mode:
- Attachments: received files download through Orbit's authenticated proxy (Orbit doesn't store file bytes). Sending is limited per provider: Gmail 25 MB, Outlook 3 MB per file (larger files need Graph upload sessions, not built yet), Slack 100 MB, Telegram 50 MB. Your host's request-body limit also applies (Vercel functions: 4.5 MB).
- Slack reactions and thread replies are shown, not editable.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): structure, connector model, sending guarantees, sync, security, schema
- [Integrations](docs/INTEGRATIONS.md): what each platform's official API allows, and the alternatives
- [Design system](docs/DESIGN_SYSTEM.md): tokens, typography, motion, interaction principles
- [API research (Nov 2026)](docs/research/api-landscape-2026-11.md): sourced findings for every platform

## Stack

Next.js 16 (App Router, Turbopack, React Compiler) · React 19 · TypeScript · Tailwind CSS v4 · Radix primitives · Zustand · Supabase (Postgres, Auth, RLS) · Anthropic Claude (`claude-opus-5-5`).
