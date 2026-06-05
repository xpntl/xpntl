CREATE TABLE social_posts (
  id          TEXT PRIMARY KEY,
  platform    TEXT NOT NULL DEFAULT 'x',
  content     TEXT NOT NULL,
  post_id     TEXT,
  posted_at   TIMESTAMPTZ,
  error       TEXT,
  theme       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_posted_at ON social_posts (posted_at DESC);
