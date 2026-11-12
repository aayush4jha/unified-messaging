# Unified inbox: what each platform's official API allows (as of 2026-11-12)

**How this was checked.** Primary docs were fetched on 2026-11-12 unless a line says otherwise. Anything taken from a secondary source is marked **(secondary)**. Anything I could not confirm is marked **unverified**. Quota numbers come from live pages and can change.

---

## Summary

| Platform | Verdict | Main restriction |
|---|---|---|
| Gmail | **Feasible with restrictions** | Every read scope is *restricted*. You need Google restricted-scope verification plus a CASA security assessment, renewed every year. Gmail quotas and billing changed in May 2026. |
| Outlook / M365 (Graph mail) | **Fully feasible** | Delegated `Mail.Read`/`Mail.Send` need no admin consent and work for personal accounts. Get Publisher Verification so tenants allow user consent. |
| Generic IMAP/SMTP | **Feasible with restrictions** | Gmail and Microsoft are OAuth-only (XOAUTH2). Gmail IMAP needs the restricted `https://mail.google.com/` scope. App passwords remain only on some providers. |
| Slack | **Feasible with restrictions** | Commercially distributed apps that are **not Marketplace-approved** get `conversations.history`/`replies` at **1 req/min, 15 messages per call** for any new install since 2025-05-29. |
| Microsoft Teams | **Feasible with restrictions** | Work/school accounts only. Sending is delegated only. Polling is limited to once per day, so you must use change notifications, which last at most 3 days. |
| Telegram | **Feasible** (MTProto/TDLib) | Bot API cannot read personal chats. The user API (MTProto/TDLib) can, under the API ToS: your own `api_id`, disclosure to users, no AI training, flood limits. |
| WhatsApp | **Not feasible for personal messages.** Supported alternative: business numbers on the Cloud API, or Coexistence for WhatsApp **Business app** users | Business-only. 24-hour customer-service window. Templates required outside it. Service messages are paid from 2026-10-01. |
| Instagram | **Not feasible for personal accounts.** Supported alternative: Professional (business/creator) accounts via the Instagram API | App Review plus Business Verification. Replies only within the 24-hour window (7 days with the Human Agent tag). Message details limited to the last 20 per conversation. |
| Facebook Messenger | **Not feasible for personal messages.** Supported alternative: Facebook **Page** inboxes | Page tokens and `pages_messaging` with App Review. 24-hour window. Three message tags deprecated 2026-04-27. |
| LinkedIn | **Not feasible for personal messages.** Supported alternative: none for member DMs | The Messages API is "restricted to approved partners". Compliance access is "closed". Open permissions are sign-in and posting only. |
| Discord | **Not feasible for personal messages.** Supported alternative: a bot in servers the user adds it to, or DMs sent to the bot | No OAuth scope gives read/send access to a user's DMs. `dm_channels.read` is approved-partners only. Self-bots violate ToS. |

---

## 1. Gmail (Gmail API, multiple accounts)

**1. API and auth.** Use the Gmail API (REST) with OAuth 2.0 user consent. For multiple accounts, each Google account consents separately. Store one refresh token per account.

**2. Read and send.**
- **Read:** yes, the full mailbox.
- **Send as the user:** yes, with `messages.send` or `drafts.send`.
- **Allowed use case:** Google's Workspace API User Data policy lists "Built-in and web email clients that allow users to compose, send, read, and process email via a user interface" as an approved Gmail use case. A unified inbox fits this.
- **Caching:** The policy also says the ToS "prohibits the scraping, building databases … or otherwise creating permanent copies of Google User data. This includes keeping cached copies longer than permitted by the cache header." Design your cache and retention around this.

**3. Scopes and verification.** These are from the Gmail scopes table:

| Class | Scopes |
|---|---|
| Restricted | `https://mail.google.com/`, `gmail.readonly`, `gmail.compose`, `gmail.insert`, `gmail.modify`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing` |
| Sensitive | `gmail.send`, `gmail.addons.current.message.metadata`, `gmail.addons.current.message.readonly` |
| Non-sensitive | `gmail.labels`, `gmail.addons.current.action.compose`, `gmail.addons.current.message.action` |

- **Restricted-scope verification.** Brand verification comes first. Verification "can potentially take several weeks."
  - "If you store restricted scope data on servers (or transmit), then you must go through a security assessment." The assessment uses the App Defense Alliance CASA framework, with assurance level AL1 or AL2. The help page says "All applications must be revalidated every year."
  - The policy requires "CASA compliance, and regular security assessments." It also requires a Limited Use disclosure.
- **Before verification:**
  - In Testing status, you are "limited to up to 100 test users," and test authorizations "expire seven days from the time of consent."
  - An unverified production app is capped at "100 new users in total". The cap covers the project's lifetime and cannot be reset.

**4. Real time and rate limits.**
- **Push:** `users.watch` sends notifications to Cloud Pub/Sub.
  - You "must call the watch method at least once every 7 days." Google recommends daily.
  - The rate is at most "one event per second" per watched user. Excess events are dropped.
  - The payload holds only the email address and `historyId`. Call `history.list` to get the changes.
- **Quotas (current page):**
  - 1,200,000 quota units/min per project. 6,000 units/min per user per project.
  - Costs per call: `messages.get` 20 (60 when format is full/raw/html), `messages.list` 5, `history.list` 2, `messages.send` 100, `watch` 100, `threads.get` 40 (120 full).
  - Messages are capped at 500 recipients.
  - A daily billing threshold of 80,000,000 units/project applies. Google says it "will share full billing details later in 2026 with at least 90 days' notice."

**Changes, mid-2025 to Nov 2026 (verified)**
- **2026-05-01: tiering model and quota changes.** Quotas were adjusted for Gmail, Calendar and Drive. Quota-unit costs changed for `messages.get`, `threads.get`, `drafts.get`, `messages.attachments.get`, `messages.trash` and `threads.trash`.
  - Projects that used these APIs between Nov 2025 and Apr 2026 keep their quotas "for at least 60 days".
  - Later in 2026 (with 90 days' notice), quota increases will need billing enabled, and "API usage over standard daily thresholds will generate charges."
  - Sources: Gmail release notes; https://developers.google.com/workspace/tools-safety
- **2026-04-22:** Gmail MCP server released (Developer Preview).
- **2026-10-12 notice:** OAuth clients must be marked "agentic" by 2026-11-12 to call Workspace **MCP** servers. "Non-agent apps that only call REST APIs are unaffected."
- **2025-03-14 / 2025-05-01:** "Less secure apps" (password IMAP/SMTP/POP) were turned off. See the IMAP section.

**5. Verdict: Feasible with restrictions.** You need restricted-scope verification, an annual CASA assessment, and Limited Use and caching compliance. Plan for the new quota and billing model.

**Sources**
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://support.google.com/cloud/answer/13465431 (CASA, AL1/AL2, annual)
- https://support.google.com/cloud/answer/15549945 (100 test users, 7-day expiry, 100-user unverified cap)
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://developers.google.com/workspace/gmail/api/guides/push
- https://developers.google.com/workspace/gmail/api/reference/quota
- https://developers.google.com/workspace/gmail/api/release-notes
- https://developers.google.com/workspace/tools-safety

---

## 2. Outlook / Microsoft 365 (Microsoft Graph mail)

**1. API and auth.** Use Microsoft Graph `/me/messages`, `/me/sendMail` and related endpoints. Auth is OAuth 2.0 through the Microsoft identity platform with **delegated** permissions.

**2. Read and send.**
- **Read:** yes. The list-messages permission table shows `Mail.ReadBasic` (least privileged), `Mail.Read` and `Mail.ReadWrite`. All are supported for **work/school and personal Microsoft accounts**.
- **Send:** yes, with `Mail.Send` (delegated). Supported for both account types.

**3. Permissions and consent.**
- Delegated `Mail.Read` and `Mail.Send` show "AdminConsentRequired: No". The reference notes both are "available for consent in personal Microsoft accounts."
- **Tenant policy can still block you.** Microsoft recommends that tenants "allow user consent only for applications that have been published by a verified publisher." There is a built-in policy for "apps from verified publishers, for selected permissions."
- **Risk-based step-up consent.** If a tenant enables it, users "can't consent to most newly registered multitenant apps that aren't publisher verified." This applies to apps registered after 2020-11-08.
- **Action:** get Microsoft Publisher Verification.

**4. Real time and rate limits.**
- **Change notifications** are delivered by webhooks, Azure Event Hubs or Event Grid.
  - Subscribe to `/me/messages` or `/me/mailFolders('inbox')/messages`.
  - Maximum lifetime is 10,080 min (under 7 days). With resource data (rich notifications) it is 1,440 min.
  - "A maximum of 1,000 active subscriptions per mailbox for all applications."
  - Latency averages under 1 minute, with a maximum of 3 minutes.
  - Use delta query to catch up.
- **Outlook throttling** applies per app per mailbox: "10,000 API requests in a 10-minute period", "Four concurrent requests", and a 150 MB upload limit per 5 minutes.

**Changes, mid-2025 to Nov 2026:** I found no Graph-mail-specific breaking change in this window.

**5. Verdict: Fully feasible.** Publisher Verification is strongly recommended for enterprise tenants.

**Sources**
- https://learn.microsoft.com/en-us/graph/api/user-list-messages
- https://learn.microsoft.com/en-us/graph/api/user-sendmail
- https://learn.microsoft.com/en-us/graph/permissions-reference
- https://learn.microsoft.com/en-us/graph/change-notifications-overview
- https://learn.microsoft.com/en-us/graph/throttling-limits
- https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview
- https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent

---

## 3. Generic IMAP/SMTP (OAuth XOAUTH2 vs app passwords)

**Gmail and Google Workspace**
- **OAuth (XOAUTH2).** "The scope for IMAP, POP, and SMTP access is `https://mail.google.com/`." That scope is restricted, so the same verification and CASA requirements as the Gmail API apply. To be approved, "your app must show full utilization of `https://mail.google.com/`." Otherwise Google says to migrate to the Gmail API.
- **Password access ("less secure apps") is gone.** Google's admin help says it was turned off for all Google Accounts on 2025-03-14, covering IMAP, SMTP, POP, CalDAV and CardDAV. Google's Workspace Updates blog reportedly moved the final date to 2025-05-01 **(secondary; I did not open the blog post)**.
- **App passwords** still exist for personal accounts with 2-Step Verification. Google says they "aren't recommended and are unnecessary in most cases." They are unavailable for work/school accounts, accounts whose 2SV uses only security keys, and accounts with Advanced Protection.

**Microsoft 365 and Outlook.com**
- **OAuth** for IMAP, POP and SMTP "is available for both Microsoft 365 … and Outlook.com users." Scopes:
  - `https://outlook.office.com/IMAP.AccessAsUser.All`
  - `https://outlook.office.com/POP.AccessAsUser.All`
  - `https://outlook.office.com/SMTP.Send`
  - plus `offline_access`
- **Outlook.com basic auth** ended on 2024-09-16, per a Microsoft support article.
- **Exchange Online SMTP AUTH basic auth (MC786329, last updated 2026-01-27):**
  - No change through December 2026.
  - At the end of December 2026 it is **disabled by default** for existing tenants. Admins can re-enable it.
  - New tenants created after December 2026 do not get it.
  - The final removal date will be announced in the second half of 2027. This supersedes the earlier March to April 2026 plan.

**Others**
- **iCloud:** app-specific passwords require two-factor authentication, with "up to 25 active app-specific passwords." Apple's page also mentions authorizing "supported apps" with your Apple Account, but **the mechanism for third-party IMAP is unverified**.
- **Yahoo, Fastmail and self-hosted servers:** unverified.

**Real time and limits**
- IMAP IDLE is protocol-level push.
- Per-provider IMAP connection and bandwidth limits: **unverified**.

**Verdict: Feasible with restrictions.** Use OAuth XOAUTH2 wherever it is offered. Gmail over IMAP gains nothing on compliance compared with the Gmail API. Treat app passwords as a fallback for the providers that still allow them.

**Sources**
- https://developers.google.com/workspace/gmail/imap/xoauth2-protocol
- https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth
- https://support.google.com/accounts/answer/185833
- https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
- https://support.microsoft.com/en-us/topic/c5d65390-9676-4763-b41f-d7986499a90d
- https://mc.merill.net/message/MC786329 (mirror of Microsoft Message Center MC786329)
- https://support.apple.com/en-us/102654

---

## 4. Slack

**1. API and auth.** Use the Web API with OAuth v2.
- **User tokens (`xoxp-`)** "represent the same access a user has … Write actions with user tokens are performed as if by the user themselves."
- **Bot tokens (`xoxb-`)** are tied to the app, not a person.

**2. Read and send.**
- **Read:** use `conversations.history` and `conversations.replies`.
  - A **user token** reaches "Any private conversation the user is a member of, and all public conversations."
  - A **bot token** reaches only conversations the bot is a member of.
  - Scopes are `channels:history`, `groups:history`, `im:history` and `mpim:history`. For DMs, request them as **user** scopes.
- **Send as the user:** use `chat.postMessage` with a user token and the user scope `chat:write`.
  - `as_user` is legacy and works for classic apps only.
  - Bots "cannot post to a direct message conversation between two users."
  - `chat:write.customize` lets a bot post with a custom name and icon. It still is not the user.

**3. Restrictions and review: the Marketplace throttle.**
- **Who is throttled.** For "commercially distributed apps not approved for the Marketplace", `conversations.history` and `conversations.replies` drop from Tier 3 to Tier 1. That means **1 request per minute and a maximum of 15 objects per request** (the `limit` default and maximum also become 15).
- **Effective dates.**
  - Immediately (2025-05-29) for new non-Marketplace apps and new installs of existing ones.
  - Existing installs: earlier versions of the changelog said 2025-09-02, then 2026-03-03. The current text (checked live and in a Wayback snapshot from 2026-03-10 onward) says existing installs "will not be impacted."
  - Secondary blogs claim enforcement on 2026-03-03. Treat existing-install enforcement as **conflicting; the primary source currently says exempt**. A new unified-inbox app would be a *new install* either way.
- **Who is exempt.** Marketplace apps, and internal customer-built apps (about 50 req/min, `limit` up to 1,000).
- **API Terms of Service update.** Effective immediately for apps created on or after 2025-05-29, and on 2025-06-30 for older apps. The Marketplace is described as the only appropriate channel for commercial distribution.

**4. Real time and other limits.**
- **Events API:** "30,000 deliveries per workspace/team per app per 60 minutes."
- **`chat.postMessage`:** about 1 message per second per channel. A workspace-wide limit of "several hundred messages per minute" also applies.
- **Socket Mode:** also exists. I did not re-verify it here.

**5. Verdict: Feasible with restrictions.** You need Slack Marketplace approval, otherwise history sync runs at 1 call/min with 15 messages per call. Use user tokens to read DMs and to send as the user.

**Sources**
- https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps (current text)
- Wayback snapshots of the same URL: 20250721142026 (Sept 2 2025 date), 20251008170049 (~~Sept 2 2025~~ → Mar 3 2026), 20260310161620 ("will not be impacted")
- https://docs.slack.dev/ja-jp/2025-05-terms-rate-limit-update-and-faq
- https://docs.slack.dev/reference/methods/conversations.history
- https://docs.slack.dev/reference/methods/chat.postMessage
- https://docs.slack.dev/authentication/tokens
- https://docs.slack.dev/apis/web-api/rate-limits
- (secondary) https://dev.to/helen_mireille_47b02db70c/slack-just-throttled-your-openclaw-agent-you-probably-havent-noticed-yet-d4

---

## 5. Microsoft Teams (Graph chat messages)

**1. API and auth.** Use Microsoft Graph with OAuth 2.0 delegated permissions. **Work/school accounts only.** Both list and send show "Delegated (personal Microsoft account): Not supported."

**2. Read and send.**
- **Read:** use `GET /me/chats` and `/chats/{id}/messages` with `Chat.Read` (delegated, AdminConsentRequired: No).
  - `$top` maximum is 50.
  - `$orderby` supports descending order only.
- **Send:** use `POST /chats/{id}/messages` with `ChatMessage.Send` (delegated, AdminConsentRequired: No).
  - The only application permission is `Teamwork.Migrate.All`, which is for importing history. Sending is effectively delegated-only.
  - Microsoft's note: "It's a violation of the terms of use to use Microsoft Teams as a log file."

**3. Protected APIs and licensing.**
- **Metering ended.** From 2025-08-25 the Teams APIs (including `getAllMessages` and `getAllRetainedMessages`) are **no longer metered**, and the `model=` parameter is ignored. The licensing page is deprecated and scheduled for removal in June 2026 (MC1122144).
- **Protected API request form.** It was historically required for application-permission export APIs. The doc page (`/graph/teams-protected-apis`) returned **404** on 2026-11-12, so **the current process is unverified**.
- The delegated per-chat endpoints above carry no protected-API note on their reference pages.

**4. Real time and rate limits.**
- **Polling rule:** "If your app polls to see whether a resource has changed, you can only do that once per day." Use change notifications instead.
- **Subscriptions:**
  - Subscribe to `/users/{id}/chats/getAllMessages`, which supports delegated `Chat.Read`/`Chat.ReadWrite`, or to `/chats/{id}/messages`.
  - Rich payloads need an encryption certificate.
  - Maximum lifetime is **4,320 min (3 days)**.
  - Quotas: 10 per user, and 10,000 Teams subscriptions per organization shared across all apps.
  - Latency averages under 10 seconds, with a maximum of 1 minute.
- **Throttling:**
  - `GET /chats/{id}/messages`: 20 rps per app per tenant, 1 rps per chat.
  - `POST` messages: 1 rps per user, 1 rps per chat.
  - `GET /me/chats`: 1 rps per user.
  - Sustained traffic is also capped at about 83% of the listed rate over a longer window.

**5. Verdict: Feasible with restrictions.** Work/school accounts only (consumer Teams is unsupported). Tenant consent policies apply. Rely on change notifications, renewed every 3 days, because polling is limited to once per day.

**Sources**
- https://learn.microsoft.com/en-us/graph/api/chat-list-messages
- https://learn.microsoft.com/en-us/graph/api/chat-post-messages
- https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage
- https://learn.microsoft.com/en-us/graph/change-notifications-overview
- https://learn.microsoft.com/en-us/graph/throttling-limits
- https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview (polling requirements)
- https://learn.microsoft.com/en-us/graph/metered-api-list
- https://mc.merill.net/message/MC1122144
- https://learn.microsoft.com/en-us/answers/questions/5828700/payment-for-teams-export-apis-getallmessages-and-g

---

## 6. Telegram (Bot API vs MTProto/TDLib)

**Bot API** (HTTPS, bot token from @BotFather)
- **What a bot sees:** its own private chats, channels it belongs to, and group messages as privacy mode allows. It **cannot read a user's chats with other people.**
- **Business Bots ("Secretary Mode")** offer a partial path. Per the Bot Developer ToS §5.4, "Telegram Business subscribers may choose to connect a Telegram Bot to their account … in a subset of private chats of their choosing."
  - The bot receives `business_message`, `edited_business_message` and `deleted_business_messages` updates.
  - It sends with `business_connection_id`.
  - `can_reply` allows sending in private chats "that had incoming messages in the last 24 hours."
  - §5.4 bars using the data for anything except the bot's service, and bars disclosing it to third parties without the user's authorization.
  - Backfilling history through business bots: **unverified** (I found no history endpoint).
- **Limits:** about 1 message/sec per chat, 20 messages/min per group, and about 30 messages/sec broadcast. Paid broadcasts go up to 1,000/sec.
- **Real time:** webhooks or `getUpdates`.

**MTProto user API and TDLib** (official third-party client route)
- **Credentials:** get your own `api_id` and `api_hash` at my.telegram.org. "Each number can only have one api_id."
- **Login:** the user signs in with their phone code, QR code or passkey inside your app. There is no OAuth. You then have full client capability: read history (`messages.getHistory`) and send as the user.
- **TDLib** is "a cross-platform, fully functional Telegram client" meant for third-party apps.
- **API ToS obligations:**
  - Obtain your own `api_id`.
  - Users must be told the app uses the Telegram API.
  - The app title can't include "Telegram" unless preceded by "Unofficial".
  - No "actions on behalf of the user without the user's knowledge and consent."
  - No tampering with read or online status.
  - §1.5 prohibits using Telegram data "to train, fine-tune … artificial intelligence."
  - "All accounts that log in using unofficial Telegram API clients are automatically put under observation." Flooding or spam leads to a permanent ban.
- **Rate limits:** dynamic `FLOOD_WAIT_X` errors, with no published numbers.
- **Real time:** a persistent MTProto update stream.

**Changes, mid-2025 to Nov 2026:**
- Bot API 10.4 (2026-11-09) added widgets and ephemeral messages. Not inbox-critical.
- The Business Bots feature is now documented as "Secretary Mode". **Date of that change unverified.**
- **Date the AI-training clause (§1.5) was added: unverified.**

**Verdict: Feasible** through MTProto/TDLib, subject to the API ToS. The Bot API alone is not feasible for personal messages.

**Sources**
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/features (Business Bots)
- https://telegram.org/tos/bot-developers (§5.4)
- https://core.telegram.org/bots/faq
- https://core.telegram.org/api/obtaining_api_id
- https://core.telegram.org/api/terms
- https://core.telegram.org/api/auth
- https://core.telegram.org/tdlib
- https://core.telegram.org/method/messages.getHistory
- https://core.telegram.org/api/errors

---

## 7. WhatsApp (Business Platform / Cloud API)

**1. API and auth.** Use the Cloud API with Meta app tokens. Third parties onboard businesses through Embedded Signup as a Tech Provider or Solution Partner. Events arrive by webhook.

**2. Personal accounts: no.**
- "The WhatsApp Business Platform enables businesses to communicate with customers."
- "Numbers already in use with WhatsApp cannot be registered unless they are deleted first." Once registered, a number "cannot be used with WhatsApp."

**Coexistence** (WhatsApp **Business app** numbers only, not consumer WhatsApp)
- **Requirements:** onboard through Embedded Signup. You "must already be a Solution Partner or Tech Provider." The Business app must be version 2.24.17 or later.
- **History:** "All chat messages in the most recent 6 months can be synchronized" for 1:1 chats. Group chats are not synchronized. Disappearing and view-once messages are disabled.
- **Throughput:** fixed at 20 messages per second.
- **Deadline:** Embedded Signup v2 and v3 were deprecated on 2026-10-15. Use v4.

**Messaging rules**
- Free-form messages "can only be sent in an open 24-hour customer service window, which opens and resets with each user message."
- Outside that window, only (pre-approved) templates are allowed.

**3. Permissions and review.** Business verification, Tech Provider status and template approval apply. Exact current App Review permission names: **unverified**.

**4. Real time and limits.**
- Webhooks.
- 80 messages/sec default throughput per number.
- Messaging limits cap the unique users you can reach outside the window per 24 hours.

**Changes, mid-2025 to Nov 2026 (verified on Meta's pricing page)**
- **2025-07-01:** per-message pricing.
- **2026-07-01:** new "Meta Business Agent" category.
- **2026-10-01:** "As Meta resumes charging for service messages," each number gets **1,000 free service messages per month**. Meta charges from the 1,001st message.
- **2026-02-16:** AI Providers pricing policy took effect (updated 2026-05-12).
- **(Secondary)** The WhatsApp Business Solution Terms bar general-purpose AI chatbots from 2026-01-15 (TechCrunch, 2025-10-18).

**5. Verdict: Not feasible for personal messages.** Supported alternative: business numbers on the Cloud API, or Coexistence for WhatsApp Business app users. Either way you must operate as a Tech Provider.

**Sources**
- https://developers.facebook.com/docs/whatsapp/cloud-api/overview
- https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers
- https://developers.facebook.com/docs/whatsapp/pricing
- https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users
- (secondary) https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/

---

## 8. Instagram (Instagram API with Instagram Login / Facebook Login)

**1. API and auth.** There are three setups, per the overview updated 2026-10-29:
- **Instagram API with Unified Login.** "Recommended for new integrations." Login uses Instagram or Facebook credentials through Facebook Login for Business, with a Business Integration System User token.
- **Instagram API with Instagram Login.** Host `graph.instagram.com`. Uses Business Login for Instagram and the `instagram_business_*` permissions.
- **Instagram API with Facebook Login.** For Page-linked accounts. Messaging goes through the Messenger Platform.

**2. Accounts and windows.**
- **Professional accounts only.** "App users must have an Instagram professional account" (business or creator). Personal accounts are not supported.
- **Read:** the Conversations API (`/me/conversations`). "You can only get details about the 20 most recent messages in the conversation." Requests-folder threads inactive for 30 days are not returned. New messages arrive by webhook.
- **Send:** only after the Instagram user has messaged the account, within the standard window. That window is "For most user actions, it lasts 24 hours", and up to 7 days after a click-to-Direct ad.
- **Human Agent tag:** gives "the separate 7-day Human Agent window."
- Group messaging is not supported.

**3. Permissions and review.**
- Permissions: `instagram_business_basic` and `instagram_business_manage_messages`.
- Serving accounts you don't own requires **Advanced Access**, which "requires App Review and Business Verification."

**4. Real time and limits.**
- Webhooks: `messages`, `messaging_seen`, `message_edit` and others.
- Conversations API: 2 calls/sec per professional account.
- Send API: 300 calls/sec (text, links, reactions, stickers) and 10 calls/sec (audio or video).

**Changes, mid-2025 to Nov 2026**
- **Unified Login** is now the recommended setup (overview page; exact launch date **unverified**).
- **2025-10-27 to 2026-04-27:** the `share` webhook attachment is being replaced by `ig_post`, with a gradual rollout.
- **Handover Protocol** was retired for Instagram in favor of Conversation Routing.
- **2026-09-21:** the Message Replies API supports Instagram Login.
- **2026-10-05:** phone and email quick replies were disabled.
- **Earlier context:** old scope names were deprecated on 2025-01-27, and Basic Display ended on 2024-12-04.

**5. Verdict: Not feasible for personal accounts.** Feasible with restrictions for Professional accounts: App Review and Business Verification, 24-hour and 7-day reply windows, and history limited to the last 20 messages per conversation.

**Sources**
- https://developers.facebook.com/docs/instagram-platform/overview
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api
- https://developers.facebook.com/docs/instagram-platform/changelog
- https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog

---

## 9. Facebook Messenger

**1. API and auth.** Use the Messenger Platform. Facebook Login for Business issues **Page access tokens**, which are "required to send and receive messages," with the `pages_messaging` permission.

**2. Personal Messenger: no.** The platform covers only "a business' Facebook Page or Instagram Professional account." There is no API for a person's own Messenger inbox.

**Messaging windows**
- Standard window of 24 hours (up to 7 days for Click-to-Messenger ads).
- The Human Agent tag gives "a separate 7-day period."
- One-time Notification and utility templates are also available.

**3. Review and deprecations.**
- Advanced Access requires App Review.
- **From 2026-04-27**, requests using the tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` and `POST_PURCHASE_UPDATE` return error 100. Migrate to Utility Templates or the Marketing Messages API.

**4. Real time and limits.**
- Webhooks: `messages`, `message_echoes` and others.
- Messenger API: calls per 24 hours = 200 × Engaged Users.
- Conversations API: 2 calls/sec per Page.
- Send API: 300 calls/sec (text) and 10 calls/sec (audio or video).

**Changes, mid-2025 to Nov 2026:** the tag deprecation above (announced 2026-03-27), the Calling API reaching GA (2026-02-11), and share and appointment data added to the Conversations API (March 2026).

**5. Verdict: Not feasible for personal messages.** Supported alternative: Facebook Page inboxes.

**Sources**
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
- https://developers.facebook.com/docs/messenger-platform/policy/policy-overview
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog
- https://developers.facebook.com/docs/graph-api/overview/rate-limiting

---

## 10. LinkedIn

**1. API and auth.** OAuth 2.0. "Open Permissions are the only permissions that are available to all developers without special approval." They are `openid`, `profile` and `email` (Sign In with LinkedIn via OpenID Connect) and `w_member_social` (posting).

**2. Read and send.**
- **Read the user's inbox:** no.
- **Send:** the Messages API note says "Usage of this API is restricted to approved partners, subject to limitations via API agreement."
  - Even for partners, sending must follow "a specific member action" (not automated or scheduled).
  - It must be opt-in, with an editable draft.
  - No incentives are allowed.
- **Compliance permissions** (`r_compliance`, `w_compliance`): "Access is closed and may not be requested."
- **Sales Navigator (SNAP)** requires partner approval. Reports that LinkedIn is "not currently accepting new partners" are **secondary and unverified**.

**3. Real time:** none available to non-partners.

**Changes, mid-2025 to Nov 2026:** none verified.

**5. Verdict: Not feasible for personal messages.** There is no supported alternative for member DMs.
- Suggestion (not an API capability): deep-link users to linkedin.com/messaging.
- Suggestion: surface LinkedIn's notification emails through the Gmail or Outlook connectors.

**Sources**
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages
- (secondary) https://generect.com/blog/linkedin-api/

---

## 11. Discord

**1. API and auth.** Bots use a bot token plus the Gateway. OAuth2 covers user identity and consent scopes.

**2. Read and send.**
- **Bot users** are "a separate type of user dedicated to automation." They "cannot have friends or be added to or join Group DMs." Bots see only guilds they were added to and DMs with the bot.
- **No OAuth scope gives REST access to a user's DMs.**
  - `dm_channels.read`: "only available to approved partners."
  - `messages.read`: "for local rpc server api access" only.
  - `rpc.*`: approved partners only.
- **Self-bots** (automating a normal user account) are prohibited. Discord says self-bots are "a violation of our API Terms of Use," and its Community Guidelines bar self-bots and user-bots.
- **Social SDK** has DMs on behalf of users, but only for **games**. Before approval, it is limited to "100 requests every 2 hours" for sends. Full access needs the game feature set (account linking, Rich Presence, friends list).

**3. Intents and review.**
- `MESSAGE_CONTENT` is a privileged intent.
- **2026-06-10 change:** the review threshold is now **10,000 users** (previously 100 servers), and access must be renewed **annually**.

**4. Real time and limits.**
- Real time through the Gateway WebSocket.
- Global limit of 50 requests/sec per bot, plus per-route buckets.

**Changes, mid-2025 to Nov 2026**
- **2026-06-10:** privileged-intent rules (above).
- **2026-04-14:** forwarding a message requires being able to read its content.
- **2026-08-12:** channel obfuscation, mandatory for all bots on 2026-11-16.
- **2026-09-22:** age assurance; Social SDK DMs may go to Message Requests more often.
- **2026-10-14:** OAuth2 authorization responses include `iss`.

**5. Verdict: Not feasible for personal messages.** Supported alternative: a bot in servers the user adds it to, or DMs sent to the bot.

**Sources**
- https://discord.com/developers/docs/topics/oauth2 (source: github.com/discord/discord-api-docs `developers/topics/oauth2.mdx`)
- https://discord.com/developers/docs/topics/rate-limits
- https://discord.com/developers/docs/events/gateway
- https://discord.com/developers/docs/change-log
- https://discord.com/developers/docs/discord-social-sdk/core-concepts/communication-features
- https://support.discord.com/hc/articles/115002192352 (self-bots)
- https://discord.com/guidelines

---

## Consolidated changes, mid-2025 to Nov 2026

| Date | Platform | Change | Source |
|---|---|---|---|
| 2025-05-29 | Slack | Non-Marketplace apps: `conversations.history`/`replies` cut to 1 req/min and 15 objects for new apps and installs. New API ToS (older apps from 2025-06-30). Existing installs currently stated as unaffected, after earlier dates of 2025-09-02 and 2026-03-03. | docs.slack.dev changelog and Wayback |
| 2025-07-01 | WhatsApp | Per-message pricing. | WA pricing page |
| 2025-08-25 | Teams | Teams APIs (`getAllMessages` etc.) no longer metered; `model=` ignored. | MC1122144; metered-api-list |
| 2025-10-27 → 2026-04-27 | Instagram | `share` attachment replaced by `ig_post` in webhooks. | Messenger/IG changelog |
| 2026-01-15 | WhatsApp | General-purpose AI chatbots barred (secondary). | TechCrunch |
| 2026-01-27 | Exchange Online | SMTP AUTH basic auth: default-off at end of Dec 2026; final removal date to be announced in H2 2027. | MC786329 |
| 2026-04-14 | Discord | Forwarding requires message-content access. | Discord change log |
| 2026-04-22 | Gmail | Gmail MCP server (Developer Preview). | Gmail release notes |
| 2026-04-27 | Messenger | Three message tags deprecated (error 100). | Messenger changelog |
| 2026-05-01 | Gmail | New tiering model and quota-unit changes; billing for over-threshold use coming later in 2026. | Gmail release notes; tools-safety |
| 2026-06-10 | Discord | Privileged-intent review threshold of 10,000 users; annual reapplication. | Discord change log |
| 2026-07-01 | WhatsApp | Meta Business Agent message category. | WA pricing page |
| 2026-10-01 | WhatsApp | Service messages charged beyond 1,000 free per number per month. | WA pricing page |
| 2026-10-15 | WhatsApp | Embedded Signup v2 and v3 deprecated (Coexistence onboarding must use v4). | WA coexistence doc |
| 2026-10-29 (page date) | Instagram | "Instagram API with Unified Login" recommended for new integrations. | IG platform overview |
| 2026-11-12 | Google Workspace | OAuth clients must be marked agentic to call Workspace MCP servers (REST-only apps unaffected). | Gmail release notes |
| 2026-11-16 | Discord | Channel obfuscation mandatory for bots. | Discord change log |

## Unverified or open items
- Teams protected-API request process: the doc URL returned 404.
- Telegram Business-bot history backfill.
- Exact WhatsApp App Review permission names.
- LinkedIn SNAP "not accepting partners" (secondary only).
- Apple ID authorization for third-party IMAP.
- Yahoo, Fastmail and self-hosted IMAP policies.
- The date Google's "less secure apps" shutoff took final effect (help page says 2025-03-14; blog reportedly 2025-05-01).
