-- Up Migration
-- Harness keys can be bound to an agent user (agent_user_id) so the key
-- authenticates AS that agent. Deleting the agent should take its credentials
-- with it, so make the FK cascade — otherwise removing an agent that has a
-- bound key fails with a foreign-key violation.

ALTER TABLE coding_harness_keys DROP CONSTRAINT IF EXISTS coding_harness_keys_agent_user_id_fkey;
ALTER TABLE coding_harness_keys
  ADD CONSTRAINT coding_harness_keys_agent_user_id_fkey
  FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE coding_harness_keys DROP CONSTRAINT IF EXISTS coding_harness_keys_agent_user_id_fkey;
ALTER TABLE coding_harness_keys
  ADD CONSTRAINT coding_harness_keys_agent_user_id_fkey
  FOREIGN KEY (agent_user_id) REFERENCES users(id);
