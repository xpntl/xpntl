-- Up Migration
-- XP-11: track when each user (human or agent) was last active, to drive
-- online / idle / offline presence indicators. Bumped (throttled) by the auth
-- middleware on every authenticated request, so it covers humans via sessions
-- and agents via API/harness keys alike.

ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at;
