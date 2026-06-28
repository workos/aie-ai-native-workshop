-- Plan 4 — opt-in AI-Native pillar score, volunteered by the attendee through the
-- coach (consent-gated). DISTINCT from responses.score (the AI-derived per-answer
-- leverage). One score per participant. NULL = not volunteered; the room
-- before->after aggregate counts only rows where ai_native_after IS NOT NULL, so a
-- never-scanned attendee is never aggregated.
ALTER TABLE participants ADD COLUMN ai_native_before INTEGER;  -- 0..100, marker scoreBefore
ALTER TABLE participants ADD COLUMN ai_native_after  INTEGER;  -- 0..100, fresh after-score
ALTER TABLE participants ADD COLUMN ai_native_delta  INTEGER;  -- after - before
ALTER TABLE participants ADD COLUMN pillars_passed   TEXT;     -- JSON array of cleared pillar ids
ALTER TABLE participants ADD COLUMN scored_at        INTEGER;  -- when the score was volunteered
