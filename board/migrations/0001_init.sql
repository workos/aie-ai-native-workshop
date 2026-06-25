-- aie-board schema — The AI-Native Engineer live room board.
--
-- One participant per attendee. The id is minted by the coach check-in skill and
-- persisted to a known durable path so the pre + post submissions link to the same
-- person (that linkage is what powers the before→after migration on the board).
CREATE TABLE IF NOT EXISTS participants (
  id          TEXT PRIMARY KEY,
  role_raw    TEXT,                 -- free-text role/stack, e.g. "Backend / Go"
  bucket      TEXT,                 -- backend|frontend|fullstack|infra|ml|lead (AI-normalized)
  created_at  INTEGER NOT NULL
);

-- One row per (participant, phase, question) answer. answer_raw is written immediately
-- on POST so nothing is ever lost; the AI columns fill in async via Haiku enrichment.
CREATE TABLE IF NOT EXISTS responses (
  id                TEXT PRIMARY KEY,
  participant_id    TEXT NOT NULL,
  phase             TEXT NOT NULL,  -- 'pre' | 'post'
  question_key      TEXT NOT NULL,
  answer_raw        TEXT NOT NULL,
  answer_summary    TEXT,           -- AI one-liner for the projector (null until enriched)
  category          TEXT,           -- AI tag: tests|reviews|deploys|docs|boilerplate|debugging|...
  score             INTEGER,        -- 0-100 leverage axis: 0 = all manual toil, 100 = fully automated
  suggestion_type   TEXT,           -- 'hook' | 'schedule' (the automation the AI recommends)
  suggestion_title  TEXT,           -- e.g. "lint + typecheck hook on every edit"
  est_hours         REAL,           -- estimated hours/week the suggestion reclaims
  created_at        INTEGER NOT NULL,
  enriched_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_responses_phase ON responses (phase, question_key);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON responses (participant_id);
CREATE INDEX IF NOT EXISTS idx_responses_created ON responses (created_at);

-- Cached Opus room-synthesis, one row per phase. Regenerated lazily on a throttle.
CREATE TABLE IF NOT EXISTS synthesis (
  phase         TEXT PRIMARY KEY,   -- 'pre' | 'post'
  generated_at  INTEGER NOT NULL,
  payload_json  TEXT NOT NULL
);
