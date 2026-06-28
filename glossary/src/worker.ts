import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import glossary from './glossary.json'

// ────────────────────────────────────────────────────────────────────────
// Cloudflare Worker for "The AI-Native Glossary".
//
//   - Every non-/api request → the Vite static build via the ASSETS binding.
//   - POST /api/chat → streaming "ask the glossary" chat, powered by Claude
//     Haiku. No RAG, no DB: the entire glossary fits in the system prompt.
//
// Every question logged with console.log is signal about what the room is
// actually struggling with — the source's logging insight, minus the
// Prisma/Postgres dependency (dropped entirely).
// ────────────────────────────────────────────────────────────────────────

export interface Env {
  ASSETS: Fetcher
  ANTHROPIC_API_KEY?: string
}

// Soft per-IP limit — resets on cold start, which is fine: this guards against
// runaway abuse, not billing-grade metering. High limit accounts for shared
// conference WiFi where many attendees share one IP.
const hits = new Map<string, { count: number; windowStart: number }>()
const LIMIT = 300
const WINDOW_MS = 60 * 60 * 1000

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  return entry.count > LIMIT
}

function buildSystemPrompt(): string {
  const terms = glossary.sections
    .map(
      (s) =>
        `## ${s.level} — ${s.name} (${s.difficulty})\n` +
        s.terms.map((t) => `- **${t.term}**: ${t.definition}`).join('\n'),
    )
    .join('\n\n')

  return `You are the live assistant for "The AI-Native Glossary" — a page built for The AI-Native Engineer workshop at AI Engineer in San Francisco, by Zack Proser and Nick Nisi. The audience is working engineers learning to operate fleets of agents by voice, in loops, behind verification gates, and on a schedule.

Your job: answer questions about AI concepts, the glossary's terms, and how an operator works — in the same voice as the glossary: plain language, direct, warm, concrete. There are no dumb questions.

THE GLOSSARY (your source of truth):

${terms}

CONTEXT YOU KNOW:
- The workshop is about becoming an operator: you direct the agents that write the code — by voice (Handy, push-to-talk), in agentic loops (the /loop command, goals as checklists, dynamic workflows, worktrees), behind verification gates (hooks, test suites, adversarial review with a second model), and on a schedule (scheduled tasks, cron, headless agents).
- The throughline: typing tops out near 40–80 wpm, speaking near 150 — voice roughly triples your throughput to the agent, which makes running a fleet practical.

RULES:
- Keep answers SHORT: 2-5 sentences for most questions. This may be read on a phone at a workshop table.
- When a glossary term is relevant, name it so they can find it on the page.
- If asked about anything confidential or company-internal: you don't know internals — suggest they ask their team or a facilitator.
- If a question is out of scope (personal advice, unrelated tech support, anything sketchy): decline kindly.
- Never invent facts about pricing, the workshop, or tools you don't know. "Good one for the room" is a fine answer.
- Banned phrases: "great question!", "I'd be happy to", "delve", "unlock", "seamless", and the construction "this isn't X, it's Y". State what things are.`
}

interface ChatMessage {
  role: string
  content: unknown
}

async function handleChat(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) {
    return new Response('Slow down a little — try again in a bit.', { status: 429 })
  }

  let body: { messages?: ChatMessage[]; via?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return new Response('Bad request', { status: 400 })
  }

  // Validate message content size to prevent abuse via search-seeded queries.
  const MAX_CONTENT_LENGTH = 2000
  for (const m of messages) {
    const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    if (contentStr.length > MAX_CONTENT_LENGTH) {
      return new Response('Message too long', { status: 400 })
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  // Signal capture: every question is a data point about where the room is confused.
  console.log(`[chat] q: ${String(lastUser?.content ?? '').slice(0, 300)}`)

  if (!env.ANTHROPIC_API_KEY) {
    // The page must render without a key; the chat errors gracefully.
    return new Response('The assistant is not configured yet — ask a facilitator.', { status: 503 })
  }

  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    system: buildSystemPrompt(),
    messages: messages.slice(-12) as Parameters<typeof streamText>[0]['messages'],
    maxTokens: 450,
    onFinish: ({ text }) => {
      console.log(`[chat] a: ${text.slice(0, 400)}`)
    },
  })

  return result.toDataStreamResponse()
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/api/chat') {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      return handleChat(req, env)
    }

    // Everything else is the static Vite build.
    return env.ASSETS.fetch(req)
  },
}
