-- Up Migration
-- Several user-referencing FKs were created inline with no ON DELETE clause
-- (default NO ACTION), so deleting a user/agent with any related rows failed
-- with a foreign-key 500. Give them sane on-delete behavior so removing a
-- member (or an agent) works. (issues.creator_id and comments.author_id stay
-- ON DELETE RESTRICT — the app reattributes those to preserve authorship.)

-- notifications: a recipient's notifications go with them; keep notifications
-- the user merely triggered, just drop the actor link.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- api keys are personal credentials — revoke them when their creator is removed.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_created_by_fkey;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- workflow automations are workspace config — keep them, just null the creator.
ALTER TABLE workflow_automations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE workflow_automations DROP CONSTRAINT IF EXISTS workflow_automations_created_by_fkey;
ALTER TABLE workflow_automations
  ADD CONSTRAINT workflow_automations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- assigned comments (action items) — clear the assignee if that user is removed.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_assignee_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_created_by_fkey;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE workflow_automations DROP CONSTRAINT IF EXISTS workflow_automations_created_by_fkey;
ALTER TABLE workflow_automations
  ADD CONSTRAINT workflow_automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_assignee_id_fkey;
ALTER TABLE comments
  ADD CONSTRAINT comments_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id);
