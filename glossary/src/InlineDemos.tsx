import { motion } from 'framer-motion'

// Small, self-contained animated diagrams. Each is pure CSS/SVG + framer-motion
// — no external data, no network, nothing that can render broken. Any embed
// kind we don't recognize renders nothing.

function AgentLoop() {
  const steps = ['think', 'act', 'check']
  return (
    <div className="gg-viz gg-viz-loop" aria-hidden="true">
      {steps.map((s, i) => (
        <motion.span
          key={s}
          className="node"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.1, repeat: Infinity, delay: i * 0.7 }}
        >
          {s}
        </motion.span>
      ))}
      <span className="loop-arrow">↻</span>
    </div>
  )
}

function ContextWindow() {
  return (
    <div className="gg-viz gg-viz-ctx" aria-hidden="true">
      <div className="ctx-frame">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.span
            key={i}
            className="ctx-cell"
            animate={{ opacity: i < 9 ? [0.25, 0.9, 0.25] : 0.12 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
      </div>
      <span className="ctx-label">working memory — fills, then older bits fall out</span>
    </div>
  )
}

function FanOut({ label }: { label: string }) {
  return (
    <div className="gg-viz gg-viz-fan" aria-hidden="true">
      <span className="root">{label}</span>
      <div className="leaves">
        {Array.from({ length: 3 }).map((_, i) => (
          <motion.span
            key={i}
            className="leaf"
            animate={{ y: [4, 0, 4], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.35 }}
          />
        ))}
      </div>
    </div>
  )
}

export default function InlineDemo({ kind }: { kind: string }) {
  switch (kind) {
    case 'agent-loop':
      return <AgentLoop />
    case 'context-window':
      return <ContextWindow />
    case 'subagent':
      return <FanOut label="agent" />
    case 'orchestrator':
      return <FanOut label="orchestrator" />
    default:
      return null
  }
}
