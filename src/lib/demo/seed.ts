/**
 * Sample workspace used for the interactive demo.
 *
 * Every record here is flagged `isDemo: true` and the UI labels it as sample
 * data. Nothing in this file comes from — or pretends to come from — a real
 * connected account. Timestamps are generated relative to "now" so the demo
 * always reads as current.
 */
import type {
  Account,
  AppNotification,
  Attachment,
  Contact,
  Conversation,
  ConversationCategory,
  ConversationKind,
  ConversationNote,
  Draft,
  Label,
  Message,
  Participant,
  Reminder,
  ScheduledMessage,
} from "../types";
import { hueFromString } from "../utils";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

export const DEMO_USER = {
  name: "Alex Rivera",
  email: "alex.rivera@gmail.com",
};

function at(offsetMs: number, base: number): string {
  return new Date(base - offsetMs).toISOString();
}

/** Returns a timestamp for a specific hour on `daysAgo` days before base. */
function dayAt(daysAgo: number, hour: number, minute: number, base: number): number {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return base - d.getTime();
}

export interface DemoData {
  accounts: Account[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  reminders: Reminder[];
  notes: Record<string, ConversationNote>;
  drafts: Draft[];
  scheduled: ScheduledMessage[];
  labels: Label[];
  notifications: AppNotification[];
}

export function createDemoData(now = Date.now()): DemoData {
  const accounts: Account[] = [
    acct("acc_gmail_personal", "gmail", "Personal", "alex.rivera@gmail.com", { isDefaultSender: true }),
    acct("acc_gmail_work", "gmail", "Work", "alex@northwind.studio"),
    acct("acc_gmail_uni", "gmail", "University", "arivera@stanmore.edu", {
      status: "needs_reauth",
      statusMessage: "Google revoked access after a password change. Reconnect to resume syncing.",
    }),
    acct("acc_wa_personal", "whatsapp", "Personal", "+1 415 555 0142", {
      capabilityOverrides: { reply: false, send: false, compose: false, attachments: false },
      statusMessage: "Preview only: WhatsApp has no API for personal accounts.",
    }),
    acct("acc_wa_business", "whatsapp", "Business", "Northwind Studio · +1 415 555 0199"),
    acct("acc_tg_personal", "telegram", "Personal", "@alexrivera", {
      capabilityOverrides: { reply: false, send: false, compose: false, attachments: false },
      statusMessage: "Preview only: personal Telegram chats need the MTProto connector, which isn't built yet.",
    }),
    acct("acc_tg_work", "telegram", "Work", "@northwind_help_bot", {
      capabilityOverrides: { compose: false },
    }),
    acct("acc_linkedin", "linkedin", "Personal", "linkedin.com/in/alexrivera", {
      statusMessage: "Preview only: LinkedIn messaging is limited to approved partners.",
    }),
    acct("acc_ig_personal", "instagram", "Personal", "@alex.rvr", {
      capabilityOverrides: { reply: false, attachments: false },
      statusMessage: "Preview only: personal Instagram accounts have no messaging API.",
    }),
    acct("acc_ig_business", "instagram", "Business", "@northwind.studio"),
    acct("acc_slack_northwind", "slack", "Northwind", "northwind.slack.com"),
    acct("acc_slack_osc", "slack", "Open Source Collective", "osc-community.slack.com", {
      lastSyncedAt: new Date(now - 4 * MIN).toISOString(),
    }),
  ];

  function acct(
    id: string,
    platform: Account["platform"],
    label: string,
    handle: string,
    extra: Partial<Account> = {},
  ): Account {
    return {
      id,
      platform,
      label,
      handle,
      status: "connected",
      lastSyncedAt: new Date(now - 90_000).toISOString(),
      aiEnabled: true,
      notificationsEnabled: true,
      isDemo: true,
      ...extra,
    };
  }

  const contacts: Contact[] = [
    contact("c_rahul", "Rahul Mehta", {
      company: "Lumen Labs",
      title: "University Recruiting Lead",
      emails: ["rahul.mehta@lumenlabs.io"],
      phones: ["+91 98200 41123"],
      handles: [
        { platform: "gmail", value: "rahul.mehta@lumenlabs.io", accountId: "acc_gmail_personal" },
        { platform: "linkedin", value: "in/rahulmehta-recruiting", accountId: "acc_linkedin" },
        { platform: "whatsapp", value: "+91 98200 41123", accountId: "acc_wa_personal" },
      ],
      vip: true,
      notes: "Met at the Stanmore career fair. Prefers WhatsApp for quick scheduling.",
    }),
    contact("c_priya", "Priya Sharma", {
      company: "Northwind Studio",
      title: "Product Lead",
      emails: ["priya@northwind.studio"],
      handles: [
        { platform: "slack", value: "@priya", accountId: "acc_slack_northwind" },
        { platform: "gmail", value: "priya@northwind.studio", accountId: "acc_gmail_work" },
      ],
      vip: true,
    }),
    contact("c_daniel", "Daniel Okafor", {
      company: "Halcyon Health",
      title: "Director of Operations",
      emails: ["daniel.okafor@halcyonhealth.com"],
      phones: ["+1 312 555 0187"],
      handles: [{ platform: "gmail", value: "daniel.okafor@halcyonhealth.com", accountId: "acc_gmail_work" }],
      notes: "Client. Budget owner for the patient portal redesign.",
    }),
    contact("c_mom", "Mom", {
      phones: ["+1 415 555 0110"],
      handles: [{ platform: "whatsapp", value: "+1 415 555 0110", accountId: "acc_wa_personal" }],
      vip: true,
    }),
    contact("c_jordan", "Jordan Lee", {
      emails: ["jordan.lee@fastmail.com"],
      phones: ["+1 628 555 0133"],
      handles: [
        { platform: "whatsapp", value: "+1 628 555 0133", accountId: "acc_wa_personal" },
        { platform: "instagram", value: "@jordanlee.jpg", accountId: "acc_ig_personal" },
        { platform: "telegram", value: "@jlee", accountId: "acc_tg_personal" },
      ],
    }),
    contact("c_sofia", "Prof. Sofia Martinez", {
      company: "Stanmore University",
      title: "Associate Professor, HCI",
      emails: ["s.martinez@stanmore.edu"],
      handles: [{ platform: "gmail", value: "s.martinez@stanmore.edu", accountId: "acc_gmail_uni" }],
      vip: true,
    }),
    contact("c_ethan", "Ethan Brooks", {
      company: "Vantage Robotics",
      title: "Technical Recruiter",
      handles: [{ platform: "linkedin", value: "in/ethanbrooks", accountId: "acc_linkedin" }],
    }),
    contact("c_mei", "Mei Tanaka", {
      company: "Open Source Collective",
      title: "Design Systems Maintainer",
      handles: [{ platform: "slack", value: "@mei", accountId: "acc_slack_osc" }],
    }),
    contact("c_leo", "Leo Fischer", {
      company: "Northwind Studio",
      title: "Staff Engineer",
      emails: ["leo@northwind.studio"],
      handles: [{ platform: "slack", value: "@leo", accountId: "acc_slack_northwind" }],
    }),
    contact("c_aisha", "Aisha Khan", {
      handles: [{ platform: "instagram", value: "@aisha.makes", accountId: "acc_ig_business" }],
    }),
    contact("c_marco", "Marco Rossi", {
      handles: [{ platform: "telegram", value: "@marcorossi", accountId: "acc_tg_work" }],
    }),
    contact("c_nina", "Nina Petrova", {
      company: "Halcyon Health",
      title: "Product Manager",
      emails: ["nina.petrova@halcyonhealth.com"],
      handles: [{ platform: "gmail", value: "nina.petrova@halcyonhealth.com", accountId: "acc_gmail_work" }],
    }),
    contact("c_sam", "Sam Whitfield", {
      handles: [{ platform: "whatsapp", value: "+1 415 555 0161", accountId: "acc_wa_business" }],
      phones: ["+1 415 555 0161"],
    }),
    contact("c_omar", "Omar Haddad", {
      company: "Stanmore University",
      emails: ["o.haddad@stanmore.edu"],
      handles: [{ platform: "gmail", value: "o.haddad@stanmore.edu", accountId: "acc_gmail_uni" }],
    }),
    // A second record for Jordan from email, so manual merge can be demonstrated.
    contact("c_jordan_mail", "J. Lee", {
      emails: ["jordan.lee@fastmail.com"],
      handles: [{ platform: "gmail", value: "jordan.lee@fastmail.com", accountId: "acc_gmail_personal" }],
    }),
  ];

  function contact(id: string, name: string, extra: Partial<Contact>): Contact {
    return {
      id,
      name,
      avatarHue: hueFromString(name),
      emails: [],
      phones: [],
      handles: [],
      notes: "",
      vip: false,
      mergedFrom: [],
      isDemo: true,
      ...extra,
    };
  }

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const p = (contactId: string, handle?: string): Participant => {
    const c = contactById.get(contactId);
    return {
      id: contactId,
      name: c?.name ?? contactId,
      handle: handle ?? c?.emails[0] ?? c?.handles[0]?.value,
      contactId: c ? contactId : undefined,
      avatarHue: c?.avatarHue ?? hueFromString(contactId),
    };
  };
  const ext = (id: string, name: string, handle?: string): Participant => ({
    id,
    name,
    handle,
    avatarHue: hueFromString(name),
  });

  const conversations: Conversation[] = [];
  const messages: Record<string, Message[]> = {};

  interface MsgSpec {
    from: string;
    ago: number;
    body: string;
    attachments?: Attachment[];
    to?: string[];
    cc?: string[];
    status?: Message["status"];
    threadReplyCount?: number;
    threadParticipants?: string[];
    reactions?: Message["reactions"];
  }
  interface ConvSpec {
    id: string;
    account: string;
    kind: ConversationKind;
    title: string;
    participants: Participant[];
    contactId?: string;
    category: ConversationCategory;
    unread?: number;
    starred?: boolean;
    pinned?: boolean;
    important?: boolean;
    archived?: boolean;
    labels?: string[];
    muted?: boolean;
    subject?: string;
    externalUrl?: string;
    messages: MsgSpec[];
  }

  const file = (name: string, mimeType: string, size: number): Attachment => ({
    id: `att_${name.replace(/\W/g, "").toLowerCase()}`,
    name,
    mimeType,
    size,
  });

  function conv(spec: ConvSpec) {
    const account = accounts.find((a) => a.id === spec.account)!;
    const msgs: Message[] = spec.messages
      .slice()
      .sort((a, b) => b.ago - a.ago)
      .map((m, i) => ({
        id: `${spec.id}_m${i + 1}`,
        conversationId: spec.id,
        authorId: m.from,
        body: m.body,
        sentAt: at(m.ago, now),
        status: m.status ?? (m.from === "me" ? "read" : "delivered"),
        attachments: m.attachments ?? [],
        subject: spec.kind === "email" ? (i === 0 ? spec.subject ?? spec.title : `Re: ${spec.subject ?? spec.title}`) : undefined,
        to: m.to,
        cc: m.cc,
        threadReplyCount: m.threadReplyCount,
        threadParticipants: m.threadParticipants,
        reactions: m.reactions,
        isDemo: true,
      }));
    const last = msgs[msgs.length - 1];
    messages[spec.id] = msgs;
    conversations.push({
      id: spec.id,
      accountId: spec.account,
      platform: account.platform,
      kind: spec.kind,
      title: spec.title,
      participants: spec.participants,
      contactId: spec.contactId,
      lastMessageAt: last.sentAt,
      preview: last.body.replace(/\s+/g, " ").slice(0, 180),
      lastAuthorId: last.authorId,
      unreadCount: spec.unread ?? 0,
      starred: spec.starred ?? false,
      pinned: spec.pinned ?? false,
      archived: spec.archived ?? false,
      important: spec.important ?? false,
      priority: "normal",
      priorityReasons: [],
      category: spec.category,
      labels: spec.labels ?? [],
      hasAttachments: msgs.some((m) => m.attachments.length > 0),
      muted: spec.muted ?? false,
      messageCount: msgs.length,
      isDemo: true,
      externalUrl: spec.externalUrl,
    });
  }

  const me = "alex.rivera@gmail.com";

  /* ---------------------------------------------------------------- Gmail · Personal */
  conv({
    id: "cv_rahul_internship",
    account: "acc_gmail_personal",
    kind: "email",
    title: "Summer internship opportunity — Product Design, Lumen Labs",
    participants: [p("c_rahul")],
    contactId: "c_rahul",
    category: "professional",
    unread: 1,
    starred: true,
    important: true,
    labels: ["lbl_career"],
    messages: [
      {
        from: "c_rahul",
        ago: dayAt(6, 10, 12, now),
        to: [me],
        body: `Hi Alex,

I'm Rahul, I lead university recruiting at Lumen Labs. Your portfolio piece on the clinic scheduling flow came up in our design team's review, and we'd love to talk to you about our Summer internship opportunity on the Product Design team.

The internship runs 12 weeks (June–August), is hybrid out of our San Francisco office, and interns ship real work. Last year's cohort launched our onboarding redesign.

Would you be open to a 30-minute intro call next week? I've attached the role description.

Best,
Rahul Mehta
University Recruiting Lead, Lumen Labs`,
        attachments: [file("Lumen-Labs-Design-Intern-2027.pdf", "application/pdf", 284_000)],
      },
      {
        from: "me",
        ago: dayAt(5, 9, 4, now),
        to: ["rahul.mehta@lumenlabs.io"],
        body: `Hi Rahul,

Thank you for reaching out. I'd be glad to talk! I'm free Tuesday or Thursday afternoon next week (anytime after 2pm PT).

Looking forward to it,
Alex`,
      },
      {
        from: "c_rahul",
        ago: 3 * H + 20 * MIN,
        to: [me],
        body: `Great, Thursday at 3pm PT works. I've sent a calendar invite.

Before the call, could you share 2–3 case studies you're most proud of? A link to your portfolio is perfect. If you can send it by Wednesday EOD, I'll share it with the hiring manager ahead of time.

Thanks!
Rahul`,
      },
    ],
  });

  conv({
    id: "cv_jordan_mail",
    account: "acc_gmail_personal",
    kind: "email",
    title: "Photos from the Marin hike 🌲",
    participants: [p("c_jordan_mail")],
    contactId: "c_jordan_mail",
    category: "personal",
    messages: [
      {
        from: "c_jordan_mail",
        ago: 2 * D + 5 * H,
        to: [me],
        body: `Uploaded everything to the shared album — the sunset ones from the ridge came out unreal. Also attaching the two I want to print.

— J`,
        attachments: [
          file("ridge-sunset.jpg", "image/jpeg", 3_400_000),
          file("group-shot.jpg", "image/jpeg", 2_900_000),
        ],
      },
    ],
  });

  conv({
    id: "cv_bank",
    account: "acc_gmail_personal",
    kind: "email",
    title: "Your October statement is ready",
    participants: [ext("x_ledger", "Ledger Bank", "statements@ledgerbank.com")],
    category: "personal",
    labels: ["lbl_finance"],
    messages: [
      {
        from: "x_ledger",
        ago: 1 * D + 8 * H,
        to: [me],
        body: `Your October statement for the account ending in 4821 is now available in online banking.

Statement balance: $2,184.33
Payment due: November 25

This is an automated message. Please don't reply.`,
      },
    ],
  });

  conv({
    id: "cv_newsletter",
    account: "acc_gmail_personal",
    kind: "email",
    title: "The Interface Weekly #212 — Motion that means something",
    participants: [ext("x_newsletter", "The Interface Weekly", "hello@interfaceweekly.co")],
    category: "personal",
    labels: ["lbl_reading"],
    messages: [
      {
        from: "x_newsletter",
        ago: 9 * H,
        to: [me],
        body: `This week: why the best product animations explain state changes instead of decorating them, a teardown of three keyboard-first command palettes, and a reading list on typographic rhythm in dense interfaces.`,
      },
    ],
  });

  /* ---------------------------------------------------------------- Gmail · Work */
  conv({
    id: "cv_daniel_proposal",
    account: "acc_gmail_work",
    kind: "email",
    title: "Patient portal redesign — revised proposal & timeline",
    participants: [p("c_daniel"), p("c_nina")],
    contactId: "c_daniel",
    category: "work",
    unread: 2,
    important: true,
    labels: ["lbl_clients"],
    messages: [
      {
        from: "me",
        ago: 4 * D + 2 * H,
        to: ["daniel.okafor@halcyonhealth.com"],
        cc: ["priya@northwind.studio"],
        body: `Hi Daniel,

Attached is the revised proposal for the patient portal redesign. Main changes since our call:

• Phase 1 now covers appointment booking and messaging only
• Accessibility audit moved up to week 2
• Timeline is 10 weeks instead of 12

Happy to walk through it whenever suits you.

Best,
Alex`,
        attachments: [file("Halcyon-Portal-Proposal-v3.pdf", "application/pdf", 1_920_000)],
      },
      {
        from: "c_daniel",
        ago: 5 * H,
        to: ["alex@northwind.studio"],
        cc: ["nina.petrova@halcyonhealth.com"],
        body: `Alex — thanks, this is much closer. Two questions before I take it to our steering committee on Friday:

1. Can Phase 1 include the prescription refill flow? It's our #1 support ticket driver.
2. What would the budget impact be if we kept the 12-week timeline but added refills?

I need your answer by Thursday so Nina can update the deck. Looping her in.

Daniel`,
      },
      {
        from: "c_nina",
        ago: 2 * H + 10 * MIN,
        to: ["alex@northwind.studio"],
        body: `Hi Alex, Nina here (PM on the portal). Adding one data point: refill requests are ~38% of inbound portal tickets. Happy to share the breakdown if useful.`,
      },
    ],
  });

  conv({
    id: "cv_priya_mail",
    account: "acc_gmail_work",
    kind: "email",
    title: "Q4 planning doc — please review section 3",
    participants: [p("c_priya")],
    contactId: "c_priya",
    category: "work",
    messages: [
      {
        from: "c_priya",
        ago: 1 * D + 3 * H,
        to: ["alex@northwind.studio"],
        body: `Hey Alex, I've drafted the Q4 planning doc. Could you review section 3 (design ops) and leave comments? No rush, but before Monday's leads sync would be ideal.`,
      },
      {
        from: "me",
        ago: 1 * D + 1 * H,
        to: ["priya@northwind.studio"],
        body: `Will do — I'll have comments in by Friday.`,
      },
    ],
  });

  conv({
    id: "cv_invoice",
    account: "acc_gmail_work",
    kind: "email",
    title: "Invoice #NW-2291 paid",
    participants: [ext("x_billing", "Halcyon Accounts Payable", "ap@halcyonhealth.com")],
    category: "work",
    archived: true,
    labels: ["lbl_finance"],
    messages: [
      {
        from: "x_billing",
        ago: 8 * D,
        to: ["alex@northwind.studio"],
        body: `Payment for invoice #NW-2291 ($18,400.00) was sent via ACH today. Remittance advice attached.`,
        attachments: [file("Remittance-NW-2291.pdf", "application/pdf", 94_000)],
      },
    ],
  });

  /* ---------------------------------------------------------------- Gmail · University */
  conv({
    id: "cv_sofia_thesis",
    account: "acc_gmail_uni",
    kind: "email",
    title: "Thesis chapter 2 feedback + deadline",
    participants: [p("c_sofia")],
    contactId: "c_sofia",
    category: "professional",
    unread: 1,
    important: true,
    labels: ["lbl_university"],
    messages: [
      {
        from: "me",
        ago: 9 * D,
        to: ["s.martinez@stanmore.edu"],
        body: `Dear Prof. Martinez,

I've attached my draft of chapter 2 (related work). I'd especially appreciate feedback on whether the section on calm technology is too broad.

Thank you,
Alex`,
        attachments: [file("Rivera-Thesis-Ch2-draft.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 412_000)],
      },
      {
        from: "c_sofia",
        ago: 20 * H,
        to: ["arivera@stanmore.edu"],
        body: `Alex,

Solid draft. The calm technology section is fine. Narrow the survey of notification research to post-2018 work and you're set. Inline comments attached.

Please submit the revised chapter by November 20 so I can sign off before the committee meeting.

Best,
SM`,
        attachments: [file("Ch2-comments-SM.pdf", "application/pdf", 530_000)],
      },
    ],
  });

  conv({
    id: "cv_omar_ta",
    account: "acc_gmail_uni",
    kind: "email",
    title: "TA office hours swap?",
    participants: [p("c_omar")],
    contactId: "c_omar",
    category: "professional",
    messages: [
      {
        from: "c_omar",
        ago: 3 * D + 4 * H,
        to: ["arivera@stanmore.edu"],
        body: `Hey Alex, any chance you could swap office hours with me next Tuesday? I have a conference talk. I can take your Thursday slot.`,
      },
    ],
  });

  /* ---------------------------------------------------------------- WhatsApp · Personal */
  conv({
    id: "cv_mom",
    account: "acc_wa_personal",
    kind: "dm",
    title: "Mom",
    participants: [p("c_mom")],
    contactId: "c_mom",
    category: "personal",
    unread: 2,
    pinned: true,
    externalUrl: "https://web.whatsapp.com",
    messages: [
      { from: "c_mom", ago: 1 * D + 2 * H, body: "Did you get home ok? 🙂" },
      { from: "me", ago: 1 * D + 1 * H, body: "Yes! Got in around 10. Thanks for dinner ❤️" },
      { from: "c_mom", ago: 48 * MIN, body: "Dad wants to know if you're coming for Thanksgiving or staying in the city" },
      { from: "c_mom", ago: 46 * MIN, body: "Also call grandma this weekend, she keeps asking about your thesis" },
    ],
  });

  conv({
    id: "cv_jordan_wa",
    account: "acc_wa_personal",
    kind: "dm",
    title: "Jordan Lee",
    participants: [p("c_jordan", "+1 628 555 0133")],
    contactId: "c_jordan",
    category: "personal",
    externalUrl: "https://web.whatsapp.com",
    messages: [
      { from: "c_jordan", ago: 3 * D + 6 * H, body: "ok lisbon is officially happening 🇵🇹" },
      { from: "c_jordan", ago: 3 * D + 6 * H - 30_000, body: "here's the itinerary draft, flights are in there too", attachments: [file("Lisbon-itinerary-v2.pdf", "application/pdf", 612_000)] },
      { from: "me", ago: 3 * D + 6 * H - 18 * MIN, body: "LET'S GO. Looks great — can we swap day 3 and 4 so Sintra isn't on a Monday?" },
      { from: "c_jordan", ago: 3 * D + 5 * H + 40 * MIN, body: "good call, updating it" },
      { from: "c_jordan", ago: 7 * H, body: "flights go up $60 on friday btw, should we just book tonight?" },
    ],
  });

  conv({
    id: "cv_family_group",
    account: "acc_wa_personal",
    kind: "group",
    title: "Rivera Family",
    participants: [p("c_mom"), ext("x_dad", "Dad"), ext("x_lucia", "Lucía")],
    category: "personal",
    muted: true,
    externalUrl: "https://web.whatsapp.com",
    messages: [
      { from: "x_lucia", ago: 2 * D + 1 * H, body: "Who's bringing dessert for Sunday?" },
      { from: "x_dad", ago: 2 * D, body: "I'll make the flan" },
      { from: "c_mom", ago: 1 * D + 20 * H, body: "📷 Photo", attachments: [file("IMG_4410.jpg", "image/jpeg", 1_800_000)] },
    ],
  });

  /* ---------------------------------------------------------------- WhatsApp · Business */
  conv({
    id: "cv_sam_wa",
    account: "acc_wa_business",
    kind: "dm",
    title: "Sam Whitfield",
    participants: [p("c_sam")],
    contactId: "c_sam",
    category: "work",
    unread: 1,
    messages: [
      { from: "c_sam", ago: 6 * H, body: "Hi! Saw your studio's work on the Halcyon site. Do you take on smaller brand projects? Looking at a ~6 week engagement." },
      { from: "c_sam", ago: 6 * H - 60_000, body: "Happy to share a brief if so" },
    ],
  });

  /* ---------------------------------------------------------------- Telegram */
  conv({
    id: "cv_hiking_tg",
    account: "acc_tg_personal",
    kind: "group",
    title: "Hiking crew 🥾",
    participants: [p("c_jordan", "@jlee"), ext("x_tom", "Tom Becker", "@tbecker"), ext("x_ana", "Ana Silva", "@anasilva")],
    category: "personal",
    unread: 4,
    externalUrl: "https://web.telegram.org",
    messages: [
      { from: "x_tom", ago: 5 * H, body: "Mt Tam on Saturday? Forecast says clear after 9" },
      { from: "x_ana", ago: 4 * H + 40 * MIN, body: "I'm in. Can drive 3 people" },
      { from: "c_jordan", ago: 4 * H + 10 * MIN, body: "in!! alex you coming?" },
      { from: "x_tom", ago: 3 * H, body: "Meeting at the Pantoll lot at 8:30 then" },
    ],
  });

  conv({
    id: "cv_marco_tg",
    account: "acc_tg_work",
    kind: "dm",
    title: "Marco Rossi",
    participants: [p("c_marco")],
    contactId: "c_marco",
    category: "work",
    unread: 1,
    messages: [
      { from: "c_marco", ago: 1 * D + 6 * H, body: "Hello, I bought the Northwind icon set but the download link expired. Order #4417." },
      { from: "me", ago: 1 * D + 5 * H + 35 * MIN, body: "Hi Marco, sorry about that! I've reissued the link. It's valid for 7 days." },
      { from: "c_marco", ago: 35 * MIN, body: "Got it, thank you. Is there a Figma version of the set too?" },
    ],
  });

  /* ---------------------------------------------------------------- LinkedIn */
  conv({
    id: "cv_ethan_li",
    account: "acc_linkedin",
    kind: "dm",
    title: "Ethan Brooks",
    participants: [p("c_ethan")],
    contactId: "c_ethan",
    category: "professional",
    labels: ["lbl_career"],
    externalUrl: "https://www.linkedin.com/messaging/",
    messages: [
      {
        from: "c_ethan",
        ago: dayAt(27, 14, 5, now),
        body: "Hi Alex, I'm a technical recruiter at Vantage Robotics. We're building the operator interface for our warehouse fleet and your HCI background stood out. Open to a quick chat about our Design Engineer role?",
      },
      {
        from: "me",
        ago: dayAt(26, 9, 30, now),
        body: "Hi Ethan, thanks for reaching out! I'm focused on finishing my thesis through December, but I'd be happy to learn more about the role and timeline.",
      },
      {
        from: "c_ethan",
        ago: dayAt(25, 16, 45, now),
        body: "Totally understand. The role starts in Q1, so the timing could work. I'll send over the JD and check back in a few weeks.",
      },
    ],
  });

  conv({
    id: "cv_rahul_li",
    account: "acc_linkedin",
    kind: "dm",
    title: "Rahul Mehta",
    participants: [p("c_rahul", "in/rahulmehta-recruiting")],
    contactId: "c_rahul",
    category: "professional",
    externalUrl: "https://www.linkedin.com/messaging/",
    messages: [
      {
        from: "c_rahul",
        ago: dayAt(7, 11, 0, now),
        body: "Hi Alex, great meeting you at the Stanmore career fair! I'll follow up over email with details on the Lumen Labs internship.",
      },
    ],
  });

  /* ---------------------------------------------------------------- Instagram */
  conv({
    id: "cv_aisha_ig",
    account: "acc_ig_business",
    kind: "dm",
    title: "Aisha Khan",
    participants: [p("c_aisha")],
    contactId: "c_aisha",
    category: "work",
    unread: 1,
    messages: [
      { from: "c_aisha", ago: 2 * H + 45 * MIN, body: "Love the poster series you posted! Are prints available? I'd want the A2 size of the blue one 💙" },
    ],
  });

  conv({
    id: "cv_jordan_ig",
    account: "acc_ig_personal",
    kind: "dm",
    title: "jordanlee.jpg",
    participants: [p("c_jordan", "@jordanlee.jpg")],
    contactId: "c_jordan",
    category: "personal",
    externalUrl: "https://www.instagram.com/direct/inbox/",
    messages: [
      { from: "c_jordan", ago: 1 * D + 9 * H, body: "Shared a reel: “10 hidden spots in Lisbon”" },
      { from: "me", ago: 1 * D + 6 * H + 20 * MIN, body: "adding #4 to the list immediately" },
    ],
  });

  /* ---------------------------------------------------------------- Slack · Northwind */
  conv({
    id: "cv_slack_design_review",
    account: "acc_slack_northwind",
    kind: "channel",
    title: "design-review",
    participants: [p("c_priya", "@priya"), p("c_leo", "@leo"), ext("x_kai", "Kai Morgan", "@kai")],
    category: "work",
    unread: 3,
    messages: [
      {
        from: "c_priya",
        ago: 3 * H + 30 * MIN,
        body: "Posting the Halcyon booking flow v4 for async review. Main question: does the two-step time picker feel faster than the calendar grid?",
        attachments: [file("booking-flow-v4.png", "image/png", 820_000)],
        threadReplyCount: 6,
        threadParticipants: ["c_leo", "x_kai", "me"],
        reactions: [{ emoji: "👀", count: 3 }, { emoji: "🔥", count: 2, mine: true }],
      },
      { from: "x_kai", ago: 1 * H + 15 * MIN, body: "Two-step is faster for me. Grid is better for people rescheduling though." },
      {
        from: "c_leo",
        ago: 40 * MIN,
        body: "@alex can you confirm whether the time picker needs to support 15-min increments? Affects the API contract I'm finalizing today.",
      },
    ],
  });

  conv({
    id: "cv_slack_priya_dm",
    account: "acc_slack_northwind",
    kind: "dm",
    title: "Priya Sharma",
    participants: [p("c_priya", "@priya")],
    contactId: "c_priya",
    category: "work",
    starred: true,
    messages: [
      { from: "c_priya", ago: 1 * D + 4 * H, body: "Do you have 10 min tomorrow to sync on Halcyon scope? Daniel's refill question is going to come up Friday." },
      { from: "me", ago: 1 * D + 3 * H + 50 * MIN, body: "Yes — 11:30?" },
      { from: "c_priya", ago: 1 * D + 3 * H + 47 * MIN, body: "Perfect 👍" },
    ],
  });

  conv({
    id: "cv_slack_launch",
    account: "acc_slack_northwind",
    kind: "channel",
    title: "launch-week",
    participants: [p("c_leo", "@leo"), p("c_priya", "@priya"), ext("x_rina", "Rina Cho", "@rina")],
    category: "work",
    messages: [
      { from: "x_rina", ago: 2 * D + 2 * H, body: "Launch checklist is pinned. Marketing site goes live Tuesday 9am PT." },
      { from: "c_leo", ago: 2 * D + 1 * H, body: "Staging is green ✅", reactions: [{ emoji: "🎉", count: 5 }] },
    ],
  });

  /* ---------------------------------------------------------------- Slack · OSC */
  conv({
    id: "cv_slack_mei",
    account: "acc_slack_osc",
    kind: "dm",
    title: "Mei Tanaka",
    participants: [p("c_mei", "@mei")],
    contactId: "c_mei",
    category: "professional",
    messages: [
      { from: "me", ago: 4 * D + 3 * H, body: "Hi Mei! I opened a PR for the focus-ring tokens we discussed. Would love your review when you get a chance." },
      { from: "c_mei", ago: 4 * D + 1 * H, body: "Oh nice, I'll take a look this week!" },
    ],
  });

  conv({
    id: "cv_slack_osc_general",
    account: "acc_slack_osc",
    kind: "channel",
    title: "general",
    participants: [p("c_mei", "@mei"), ext("x_dev", "Devon Price", "@devon")],
    category: "professional",
    muted: true,
    messages: [
      { from: "x_dev", ago: 6 * H, body: "Community call is moved to Thursday this week. Agenda doc in the channel topic." },
    ],
  });

  /* ---------------------------------------------------------------- Sent / misc */
  conv({
    id: "cv_landlord",
    account: "acc_gmail_personal",
    kind: "email",
    title: "Heating in unit 4B",
    participants: [ext("x_landlord", "Bayview Property Management", "maintenance@bayviewpm.com")],
    category: "personal",
    messages: [
      {
        from: "me",
        ago: 3 * D + 2 * H,
        to: ["maintenance@bayviewpm.com"],
        body: `Hello,

The heating in unit 4B has stopped working since Sunday. Could someone take a look this week? I'm home most afternoons.

Thanks,
Alex Rivera`,
      },
    ],
  });

  const labels: Label[] = [
    { id: "lbl_career", name: "Career", hue: 28 },
    { id: "lbl_clients", name: "Clients", hue: 210 },
    { id: "lbl_university", name: "University", hue: 150 },
    { id: "lbl_finance", name: "Finance", hue: 95 },
    { id: "lbl_reading", name: "Reading", hue: 280 },
  ];

  const reminders: Reminder[] = [
    {
      id: "rem_portfolio",
      kind: "follow_up",
      title: "Send portfolio case studies to Rahul",
      conversationId: "cv_rahul_internship",
      contactId: "c_rahul",
      dueAt: nextWeekday(now, 3, 17, 0),
      createdAt: at(3 * H, now),
      source: "suggestion",
    },
    {
      id: "rem_thesis",
      kind: "task",
      title: "Submit revised thesis chapter 2",
      conversationId: "cv_sofia_thesis",
      contactId: "c_sofia",
      dueAt: at(-8 * D, now),
      createdAt: at(18 * H, now),
      source: "user",
    },
    {
      id: "rem_landlord",
      kind: "awaiting_response",
      title: "Waiting on Bayview about heating repair",
      conversationId: "cv_landlord",
      dueAt: at(1 * D, now),
      createdAt: at(3 * D, now),
      source: "user",
    },
    {
      id: "rem_q4",
      kind: "reminder",
      title: "Review Q4 planning doc section 3",
      conversationId: "cv_priya_mail",
      contactId: "c_priya",
      dueAt: at(-2 * H, now),
      createdAt: at(1 * D, now),
      source: "user",
    },
    {
      id: "rem_mei",
      kind: "awaiting_response",
      title: "Mei to review focus-ring PR",
      conversationId: "cv_slack_mei",
      contactId: "c_mei",
      dueAt: at(-1 * D, now),
      createdAt: at(4 * D, now),
      source: "user",
    },
    {
      id: "rem_done",
      kind: "follow_up",
      title: "Reissue download link for Marco",
      conversationId: "cv_marco_tg",
      createdAt: at(1 * D + 6 * H, now),
      dueAt: at(1 * D + 5 * H, now),
      completedAt: at(1 * D + 5 * H, now),
      source: "user",
    },
  ];

  const notes: Record<string, ConversationNote> = {
    cv_daniel_proposal: {
      conversationId: "cv_daniel_proposal",
      body: "Refill flow ≈ +2 weeks of design. Check with Leo on API effort before quoting.",
      updatedAt: at(2 * H, now),
    },
  };

  const drafts: Draft[] = [
    {
      id: "dr_omar",
      accountId: "acc_gmail_uni",
      conversationId: "cv_omar_ta",
      to: ["o.haddad@stanmore.edu"],
      subject: "Re: TA office hours swap?",
      body: "Hi Omar, happy to swap! I'll take your Tuesday slot and you take",
      updatedAt: at(3 * D, now),
    },
  ];

  const scheduled: ScheduledMessage[] = [
    {
      id: "sch_daniel",
      accountId: "acc_gmail_work",
      conversationId: "cv_daniel_proposal",
      to: ["daniel.okafor@halcyonhealth.com"],
      subject: "Re: Patient portal redesign — revised proposal & timeline",
      body: "Hi Daniel, following up with the refill-flow estimate as promised…",
      sendAt: nextWeekday(now, 4, 8, 30),
      createdAt: at(1 * H, now),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: "nt_1",
      kind: "priority",
      title: "Leo Fischer in #design-review",
      body: "@alex can you confirm whether the time picker needs to support 15-min increments?",
      createdAt: at(40 * MIN, now),
      read: false,
      conversationId: "cv_slack_design_review",
      accountId: "acc_slack_northwind",
    },
    {
      id: "nt_2",
      kind: "message",
      title: "Marco Rossi",
      body: "Got it, thank you. Is there a Figma version of the set too?",
      createdAt: at(35 * MIN, now),
      read: false,
      conversationId: "cv_marco_tg",
      accountId: "acc_tg_work",
    },
    {
      id: "nt_3",
      kind: "priority",
      title: "Rahul Mehta",
      body: "Great, Thursday at 3pm PT works. I've sent a calendar invite.",
      createdAt: at(3 * H + 20 * MIN, now),
      read: false,
      conversationId: "cv_rahul_internship",
      accountId: "acc_gmail_personal",
    },
    {
      id: "nt_4",
      kind: "reminder",
      title: "Overdue: Review Q4 planning doc section 3",
      body: "Was due 2 hours ago",
      createdAt: at(2 * H, now),
      read: true,
      reminderId: "rem_q4",
      conversationId: "cv_priya_mail",
    },
    {
      id: "nt_5",
      kind: "system",
      title: "University Gmail needs to reconnect",
      body: "Google revoked access after a password change.",
      createdAt: at(26 * H, now),
      read: true,
      accountId: "acc_gmail_uni",
    },
  ];

  return { accounts, contacts, conversations, messages, reminders, notes, drafts, scheduled, labels, notifications };
}

/** Next occurrence of a weekday (0=Sun) at a given time, at least a few hours out. */
function nextWeekday(base: number, weekday: number, hour: number, minute: number): string {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() < base + 3 * H) add = 7;
  d.setDate(d.getDate() + add);
  return d.toISOString();
}
