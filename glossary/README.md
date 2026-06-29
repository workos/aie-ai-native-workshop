# The AI-Native Glossary

A standalone, Cloudflare-native version of the "glossary + ask-anything chat"
page, re-themed for **Lifestyles of the AI-Native** workshop (AI Engineer · San
Francisco). Every term behind voice workflows, agentic loops, and scheduled
tasks — from the ground floor up.

## What it is

- **Client**: Vite + React + TypeScript, built to static assets in `dist/`.
  Search/filter, auto cross-linking between definitions, a scroll-spy jump nav,
  reading progress, "seen" tracking, share, a finale, and a floating
  "✦ ask anything" chat widget (Vercel AI SDK `useChat`).
- **Worker** (`src/worker.ts`): serves `dist/` for every non-`/api` path via the
  `ASSETS` binding, and handles `POST /api/chat` with `streamText` from the AI
  SDK + `@ai-sdk/anthropic`, model **`claude-haiku-4-5`**. The entire glossary is
  embedded in the system prompt — no vector DB, no Postgres. Per-IP rate limiting
  and message-size guards are enforced; every question is `console.log`'d for
  signal about what the room is struggling with.

The page builds and renders **without** an API key — the chat just errors
gracefully until the key is set.

## Develop

```bash
npm install
npm run dev          # Vite dev server (UI only; /api/chat needs the Worker)
npm run cf-dev       # build + wrangler dev (full app, including /api/chat)
```

## Deploy

Deploys to the **WorkOS Internal** Cloudflare account (account_id in
`wrangler.jsonc`). You should already be logged in via `wrangler login`
(`npx wrangler whoami` should show "WorkOS Internal").

```bash
npm run deploy       # runs the Vite build, then wrangler deploy
```

## Secret

The chat needs an Anthropic API key, set as a Worker secret:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

This is a human step — until it's set, `/api/chat` returns a graceful 503 and the
chat widget shows an error message. The rest of the page works without it.

## Access

The app sits behind **Cloudflare Access** until a bypass app is added (the human
handles that). A first request to the deployed URL typically returns a 302 to the
Access login — expected.
