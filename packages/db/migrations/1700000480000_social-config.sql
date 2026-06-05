CREATE TABLE social_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO social_config (key, value) VALUES ('model', 'claude-haiku-4-5-20251001');
