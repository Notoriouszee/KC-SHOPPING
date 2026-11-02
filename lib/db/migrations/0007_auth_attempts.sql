-- Sign-in attempt tracking (brute-force protection).
--
-- Rows are keyed by a salted hash of (IP + email), never the raw values, and are
-- cleared on a successful sign-in. Only failures are recorded.

CREATE TABLE auth_attempts (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  outcome    TEXT NOT NULL CHECK (outcome IN ('failed', 'blocked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX auth_attempts_key_idx ON auth_attempts (key, created_at DESC);
CREATE INDEX auth_attempts_ip_idx ON auth_attempts (ip_hash, created_at DESC);
