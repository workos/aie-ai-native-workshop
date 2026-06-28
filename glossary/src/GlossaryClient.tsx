import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import GlossaryChat, { AskInline } from './GlossaryChat'
import InlineDemo from './InlineDemos'

// ────────────────────────────────────────────────────────────────────────
// The AI-Native Glossary — editorial layout with:
//   - reading progress + level scroll-spy jump bar
//   - auto cross-links: term names mentioned in other definitions become
//     dashed links that scroll + flash the target entry
//   - "seen" tracking that unlocks a finale at 100%
//   - share, search, and a floating "ask anything" chat
// ────────────────────────────────────────────────────────────────────────

interface Term {
  term: string
  definition: string
  hear?: string
  embed?: string
  added?: string
}

interface Section {
  id: string
  level: string
  name: string
  intro: string
  difficulty?: string
  terms: Term[]
}

interface Glossary {
  title: string
  subtitle: string
  event: string
  credit?: string
  updated: string
  sections: Section[]
}

// "new" badge for terms added in the last 21 days.
function isNew(added?: string) {
  if (!added) return false
  return Date.now() - new Date(added).getTime() < 21 * 86400 * 1000
}

// ---- helpers ---------------------------------------------------------------

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// "MCP (Model Context Protocol)" → ["MCP", "Model Context Protocol"]
function aliasesFor(name: string): string[] {
  const m = name.match(/^(.+?)\s*\((.+?)\)\s*$/)
  const out = m ? [m[1].trim(), m[2].trim()] : [name.trim()]
  return out.filter((a) => a.length >= 3 && !a.includes(' vs'))
}

interface XrefIndex {
  regex: RegExp
  bySlugKey: Map<string, { slug: string; term: string }>
}

function buildXrefIndex(sections: Section[]): XrefIndex {
  const bySlugKey = new Map<string, { slug: string; term: string }>()
  const patterns: string[] = []
  for (const s of sections) {
    for (const t of s.terms) {
      const slug = slugify(t.term)
      for (const a of aliasesFor(t.term)) {
        bySlugKey.set(a.toLowerCase(), { slug, term: t.term })
        patterns.push(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      }
    }
  }
  patterns.sort((a, b) => b.length - a.length)
  return { regex: new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi'), bySlugKey }
}

function flashEntry(slug: string) {
  const el = document.getElementById(slug)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
}

// Definition text with the first mention of up to 3 other terms cross-linked.
function CrossLinkedText({ text, selfSlug, index }: { text: string; selfSlug: string; index: XrefIndex }) {
  const nodes = useMemo(() => {
    const out: Array<string | { slug: string; text: string }> = []
    const seen = new Set<string>()
    let last = 0
    let links = 0
    index.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = index.regex.exec(text)) !== null && links < 3) {
      const hit = index.bySlugKey.get(m[1].toLowerCase())
      if (!hit || hit.slug === selfSlug || seen.has(hit.slug)) {
        index.regex.lastIndex = m.index + m[0].length
        continue
      }
      out.push(text.slice(last, m.index))
      out.push({ slug: hit.slug, text: m[1] })
      seen.add(hit.slug)
      last = m.index + m[1].length
      links++
    }
    out.push(text.slice(last))
    return out
  }, [text, selfSlug, index])

  return (
    <>
      {nodes.map((n, i) =>
        typeof n === 'string' ? (
          <Fragment key={i}>{n}</Fragment>
        ) : (
          <a
            key={i}
            className="xref"
            href={`#${n.slug}`}
            onClick={(e) => {
              e.preventDefault()
              history.replaceState(null, '', `#${n.slug}`)
              flashEntry(n.slug)
            }}
          >
            {n.text}
          </a>
        ),
      )}
    </>
  )
}

// ---- chrome ----------------------------------------------------------------

function ReadingProgress() {
  const fillRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement
      const pct = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100
      if (fillRef.current) fillRef.current.style.width = `${Math.max(0, Math.min(100, pct))}%`
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className="gg-progress" aria-hidden="true">
      <div ref={fillRef} className="gg-progress-fill" />
    </div>
  )
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 160
      let cur: string | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top + window.scrollY <= y) cur = id
      }
      setActive(cur)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ids])
  return active
}

// Counts unique term entries that have scrolled into view.
const SEEN_KEY = 'aie-glossary-seen'

function useSeenTerms(filterKey: string, validSlugs: Set<string>) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
      const valid = stored.filter((id) => validSlugs.has(id))
      if (valid.length) setSeen((prev) => new Set([...prev, ...valid]))
    } catch {
      /* ignore */
    }
  }, [validSlugs])
  useEffect(() => {
    if (seen.size) {
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
      } catch {
        /* ignore */
      }
    }
  }, [seen])
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.gg-entry[id]'))
    const obs = new IntersectionObserver(
      (entries) => {
        const hits = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).id)
        if (hits.length) {
          setSeen((prev) => {
            const next = new Set(prev)
            hits.forEach((h) => next.add(h))
            return next.size === prev.size ? prev : next
          })
        }
      },
      { threshold: 0.6 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [filterKey])
  return seen
}

// Short labels so all five levels + search fit the jump bar on one line.
const JUMP_LABELS: Record<string, string> = {
  'level-0': 'Ground floor',
  'level-1': 'Voice',
  'level-2': 'Loops',
  'level-3': 'Scheduled',
  'level-4': 'Under the hood',
}

// ---- page ------------------------------------------------------------------

export default function GlossaryClient({ glossary }: { glossary: Glossary }) {
  const [query, setQuery] = useState('')
  const xref = useMemo(() => buildXrefIndex(glossary.sections), [glossary.sections])
  const sectionIds = useMemo(() => glossary.sections.map((s) => s.id), [glossary.sections])
  const activeSection = useScrollSpy(sectionIds)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return glossary.sections
    return glossary.sections
      .map((s) => ({
        ...s,
        terms: s.terms.filter(
          (t) =>
            t.term.toLowerCase().includes(q) ||
            t.definition.toLowerCase().includes(q) ||
            (t.hear ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.terms.length > 0)
  }, [glossary.sections, q])

  const total = glossary.sections.reduce((n, s) => n + s.terms.length, 0)
  const validSlugs = useMemo(
    () => new Set(glossary.sections.flatMap((s) => s.terms.map((t) => slugify(t.term)))),
    [glossary.sections],
  )
  const seen = useSeenTerms(q, validSlugs)
  const fluent = seen.size >= total

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // share: copy the page (or a deep link to a term) to the clipboard.
  const [copied, setCopied] = useState<string | null>(null)
  const share = async (what: string, slug?: string) => {
    const url = `${window.location.origin}/${slug ? `#${slug}` : ''}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: glossary.title, url })
        return
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="aie-glossary">
        <ReadingProgress />

        {/* hero */}
        <header className="gg-hero">
          <div className="gg-measure">
            <p className="gg-kicker">
              <span className="gg-mark">AI-Native</span> {glossary.event}
            </p>
            <h1 className="gg-title">{glossary.title}</h1>
            <p className="gg-dek">{glossary.subtitle}</p>
            <p className="gg-promise">
              No dumb questions. If a word goes by today that isn't on this page, ask — out loud, or right here.
            </p>

            <AskInline placement="hero" />

            {/* the path: tap a step to jump */}
            <nav className="gg-steps" aria-label="Difficulty path">
              <p className="gg-steps-label">
                The path runs <span className="d-easy">easy</span> → <span className="d-advanced">advanced</span>. Start where you are — tap a step.
              </p>
              <div className="gg-steps-row">
                {glossary.sections.map((sec, i) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className={`gg-step d-${sec.difficulty ?? 'easy'} ${activeSection === sec.id ? 'here' : ''}`}
                  >
                    <span className="gg-step-lvl">L{i}</span>
                    <span className="gg-step-name">{JUMP_LABELS[sec.id]}</span>
                    <span className="gg-step-diff">{sec.difficulty}</span>
                    <span className="gg-step-bar" style={{ height: `${8 + i * 7}px` }} />
                  </a>
                ))}
              </div>
            </nav>

            <dl className="gg-stats">
              <div>
                <dt>Terms</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Levels</dt>
                <dd>
                  5<span className="unit">ground → operator</span>
                </dd>
              </div>
              <div>
                <dt>Voice throughput</dt>
                <dd>
                  ~3×<span className="unit">vs typing</span>
                </dd>
              </div>
              <div>
                <dt>Dumb questions</dt>
                <dd>
                  0<span className="unit">they don't exist</span>
                </dd>
              </div>
            </dl>
          </div>
        </header>

        {/* jump bar */}
        <nav className="gg-jumpbar" aria-label="Glossary levels">
          <div className="gg-measure gg-jumpbar-inner">
            {glossary.sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className={activeSection === s.id ? 'active' : ''}>
                <span className={`lvl d-${s.difficulty ?? 'easy'}`}>L{i}</span> {JUMP_LABELS[s.id] ?? s.name}
              </a>
            ))}
            <span className={`gg-seen ${fluent ? 'fluent' : ''}`} title="Terms you've scrolled past">
              {fluent ? 'fluent ✓' : `${seen.size}/${total}`}
            </span>
            <div className="gg-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${total} terms`}
                aria-label="Search glossary terms"
              />
            </div>
          </div>
        </nav>

        {/* body */}
        <main className="gg-measure">
          {filtered.length === 0 && (
            <div className="gg-empty">
              <span className="big">Nothing matches “{query}”.</span>
              Try a shorter word — or just ask:
              <button
                type="button"
                className="gg-empty-ask"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('glossary-ask', { detail: { q: query.trim().slice(0, 500), via: 'search' } }),
                  )
                }
              >
                ask the glossary: “{query}”
              </button>
            </div>
          )}

          {filtered.map((section) => {
            const realIndex = glossary.sections.findIndex((s) => s.id === section.id)
            return (
              <section key={section.id} id={section.id} className="gg-level">
                <div className="gg-level-head">
                  <span className="gg-level-num">{'0' + section.level.replace(/\D/g, '')}</span>
                  <h2 className="gg-level-name">{section.name}</h2>
                  <span className="gg-level-tag">
                    <span className={`gg-diff d-${section.difficulty ?? 'easy'}`}>
                      <span className="ramp" aria-hidden="true">
                        {glossary.sections.map((x, xi) => (
                          <i key={x.id} className={xi <= realIndex ? 'on' : ''} />
                        ))}
                      </span>
                      {section.difficulty}
                    </span>
                    {section.terms.length} term{section.terms.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="gg-level-intro">{section.intro}</p>

                {section.terms.map((t) => {
                  const slug = slugify(t.term)
                  return (
                    <motion.article
                      key={t.term}
                      id={slug}
                      className="gg-entry"
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <h3>
                        {t.term}
                        {mounted && isNew(t.added) && <span className="gg-new">new</span>}
                        <a className="anchor" href={`#${slug}`} aria-label={`Link to ${t.term}`}>
                          #
                        </a>
                        <button
                          type="button"
                          className="gg-share"
                          onClick={() => share(slug, slug)}
                          aria-label={`Share a link to ${t.term}`}
                        >
                          {copied === slug ? 'copied ✓' : 'share'}
                        </button>
                      </h3>
                      <p className="gg-def">
                        <CrossLinkedText text={t.definition} selfSlug={slug} index={xref} />
                      </p>
                      {t.hear && (
                        <p className="gg-hear">
                          <span className="tag">you'll hear</span>
                          <span>{t.hear}</span>
                        </p>
                      )}
                      {t.embed && <InlineDemo kind={t.embed} />}
                    </motion.article>
                  )
                })}
              </section>
            )
          })}

          {/* finale */}
          {!q && (
            <motion.section
              className="gg-finale"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <p className="gg-kicker">
                <span className="gg-mark">AI-Native</span> you made it
              </p>
              <h2>
                That's the whole vocabulary. <em>You're operating now.</em>
              </h2>
              <div className="gg-finale-levels">
                {glossary.sections.map((s, i) => (
                  <motion.span
                    key={s.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.15 * i }}
                  >
                    ✓ L{i} {JUMP_LABELS[s.id]}
                  </motion.span>
                ))}
              </div>
              <AskInline placement="finale" />
              <p className="gg-finale-sub">
                Keep this page — it stays live after the workshop. Next time a word goes by that isn't on it, that's a question worth asking out loud.
              </p>
              <button type="button" className="gg-share-page" onClick={() => share('page')}>
                {copied === 'page' ? 'Link copied ✓' : 'Share this page →'}
              </button>
            </motion.section>
          )}

          {/* footer */}
          <footer className="gg-foot">
            <div className="cols">
              <div>
                <h5>The AI-Native Glossary</h5>
                <p>
                  By {glossary.credit ?? 'the workshop team'}. Last updated {glossary.updated}. Share the link freely.
                </p>
              </div>
              <div>
                <h5>Keep going</h5>
                <p>
                  Every term here is a thread you can pull on inside Claude Code. Point an agent at this page and ask it anything.
                </p>
              </div>
            </div>
          </footer>
        </main>
        <GlossaryChat />
      </div>
    </MotionConfig>
  )
}
