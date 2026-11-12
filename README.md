# Orbit

**One inbox. Every conversation. Every account. One workspace.**

Orbit is a unified communication workspace that brings email, messaging, work chat and social inboxes into one keyboard-first interface: Gmail (multiple accounts), Slack, Telegram, and more as official APIs allow.

> Status: under active development. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for which integrations are live, planned or restricted, and why.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

With no configuration, Orbit runs as a **sample workspace**: realistic demo conversations, clearly labeled, with every interaction working locally. No data leaves your browser.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): app structure, connector model, sending guarantees, sync, security, schema
- [Integrations](docs/INTEGRATIONS.md): per-platform API access, limitations and alternatives
- [Design system](docs/DESIGN_SYSTEM.md): tokens, typography, motion, interaction principles
- [API research (Nov 2026)](docs/research/api-landscape-2026-11.md): sourced findings for every platform

## Stack

Next.js 16 (App Router, Turbopack, React Compiler) · React 19 · TypeScript · Tailwind CSS v4 · Radix primitives · Zustand · Supabase (Postgres, Auth, RLS) · Anthropic Claude for AI features.
