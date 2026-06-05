-- Migration: Convert all UUID primary keys and foreign keys to TEXT with nanoid values.
-- Existing UUID values are rewritten to 21-char nanoids using a mapping table.

BEGIN;

-- 1. PL/pgSQL nanoid generator (deterministic per-migration, dropped at end)
CREATE OR REPLACE FUNCTION _nanoid(size int DEFAULT 21)
RETURNS text AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  result text := '';
  bytes bytea;
  i int;
BEGIN
  bytes := gen_random_bytes(size);
  FOR i IN 0..size-1 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) & 63) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. Build a global ID mapping: every UUID PK gets a nanoid
CREATE TEMP TABLE _id_map (
  old_id TEXT NOT NULL PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);

-- Collect all PKs from every table with a UUID id column
INSERT INTO _id_map (old_id, new_id)
SELECT id::text, _nanoid() FROM workspaces
UNION ALL SELECT id::text, _nanoid() FROM accounts
UNION ALL SELECT id::text, _nanoid() FROM users
UNION ALL SELECT id::text, _nanoid() FROM sessions
UNION ALL SELECT id::text, _nanoid() FROM workflow_states
UNION ALL SELECT id::text, _nanoid() FROM issues
UNION ALL SELECT id::text, _nanoid() FROM audit_log
UNION ALL SELECT id::text, _nanoid() FROM comments
UNION ALL SELECT id::text, _nanoid() FROM reactions
UNION ALL SELECT id::text, _nanoid() FROM labels
UNION ALL SELECT id::text, _nanoid() FROM favorites
UNION ALL SELECT id::text, _nanoid() FROM saved_views
UNION ALL SELECT id::text, _nanoid() FROM teams
UNION ALL SELECT id::text, _nanoid() FROM initiatives
UNION ALL SELECT id::text, _nanoid() FROM projects
UNION ALL SELECT id::text, _nanoid() FROM milestones
UNION ALL SELECT id::text, _nanoid() FROM custom_fields
UNION ALL SELECT id::text, _nanoid() FROM tags
UNION ALL SELECT id::text, _nanoid() FROM issue_templates
UNION ALL SELECT id::text, _nanoid() FROM project_templates
UNION ALL SELECT id::text, _nanoid() FROM issue_relations
UNION ALL SELECT id::text, _nanoid() FROM attachments
UNION ALL SELECT id::text, _nanoid() FROM checklists
UNION ALL SELECT id::text, _nanoid() FROM checklist_items
UNION ALL SELECT id::text, _nanoid() FROM subscriptions
UNION ALL SELECT id::text, _nanoid() FROM license_keys
UNION ALL SELECT id::text, _nanoid() FROM coding_harness_keys
UNION ALL SELECT id::text, _nanoid() FROM waitlist
UNION ALL SELECT id::text, _nanoid() FROM invite_codes
UNION ALL SELECT id::text, _nanoid() FROM invite_code_redemptions;

-- Also map user_id PKs from password_credentials (PK is user_id, which is a users FK)
-- These are already mapped via users above.

CREATE INDEX _id_map_old_idx ON _id_map (old_id);

-- 3. Drop all FK constraints (ALTER TYPE requires matching types on both sides)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name, tc.table_schema, tc.table_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.table_schema, r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- 4. Convert all UUID columns to TEXT
-- Root tables
ALTER TABLE workspaces ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE accounts ALTER COLUMN id TYPE TEXT USING id::text;

-- accounts sub-tables
ALTER TABLE account_credentials ALTER COLUMN account_id TYPE TEXT USING account_id::text;

-- users
ALTER TABLE users ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE users ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE users ALTER COLUMN account_id TYPE TEXT USING account_id::text;

-- sessions
ALTER TABLE sessions ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE sessions ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE sessions ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE sessions ALTER COLUMN account_id TYPE TEXT USING account_id::text;

-- workflow_states
ALTER TABLE workflow_states ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE workflow_states ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- issue_key_counters (PK is workspace_id FK)
ALTER TABLE issue_key_counters ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- password_credentials
ALTER TABLE password_credentials ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE password_credentials ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- issue_assignees
ALTER TABLE issue_assignees ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE issue_assignees ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE issue_assignees ALTER COLUMN assigned_by TYPE TEXT USING assigned_by::text;

-- issues
ALTER TABLE issues ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE issues ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE issues ALTER COLUMN state_id TYPE TEXT USING state_id::text;
ALTER TABLE issues ALTER COLUMN assignee_id TYPE TEXT USING assignee_id::text;
ALTER TABLE issues ALTER COLUMN creator_id TYPE TEXT USING creator_id::text;
ALTER TABLE issues ALTER COLUMN parent_id TYPE TEXT USING parent_id::text;
ALTER TABLE issues ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE issues ALTER COLUMN project_id TYPE TEXT USING project_id::text;
ALTER TABLE issues ALTER COLUMN milestone_id TYPE TEXT USING milestone_id::text;
ALTER TABLE issues ALTER COLUMN recurrence_source_id TYPE TEXT USING recurrence_source_id::text;

-- audit_log
ALTER TABLE audit_log ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE audit_log ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE audit_log ALTER COLUMN actor_user_id TYPE TEXT USING actor_user_id::text;
ALTER TABLE audit_log ALTER COLUMN target_id TYPE TEXT USING target_id::text;

-- comments
ALTER TABLE comments ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE comments ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE comments ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE comments ALTER COLUMN author_id TYPE TEXT USING author_id::text;

-- comment_mentions
ALTER TABLE comment_mentions ALTER COLUMN comment_id TYPE TEXT USING comment_id::text;
ALTER TABLE comment_mentions ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE comment_mentions ALTER COLUMN mentioned_user_id TYPE TEXT USING mentioned_user_id::text;

-- reactions
ALTER TABLE reactions ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE reactions ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE reactions ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE reactions ALTER COLUMN target_id TYPE TEXT USING target_id::text;

-- labels
ALTER TABLE labels ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE labels ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- issue_labels
ALTER TABLE issue_labels ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE issue_labels ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE issue_labels ALTER COLUMN label_id TYPE TEXT USING label_id::text;
ALTER TABLE issue_labels ALTER COLUMN attached_by TYPE TEXT USING attached_by::text;

-- favorites
ALTER TABLE favorites ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE favorites ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE favorites ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE favorites ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;

-- saved_views
ALTER TABLE saved_views ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE saved_views ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE saved_views ALTER COLUMN creator_id TYPE TEXT USING creator_id::text;

-- teams
ALTER TABLE teams ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE teams ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- team_members
ALTER TABLE team_members ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE team_members ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- initiatives
ALTER TABLE initiatives ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE initiatives ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- projects
ALTER TABLE projects ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE projects ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE projects ALTER COLUMN lead_id TYPE TEXT USING lead_id::text;
ALTER TABLE projects ALTER COLUMN initiative_id TYPE TEXT USING initiative_id::text;

-- project_teams
ALTER TABLE project_teams ALTER COLUMN project_id TYPE TEXT USING project_id::text;
ALTER TABLE project_teams ALTER COLUMN team_id TYPE TEXT USING team_id::text;

-- milestones
ALTER TABLE milestones ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE milestones ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE milestones ALTER COLUMN project_id TYPE TEXT USING project_id::text;

-- custom_fields
ALTER TABLE custom_fields ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE custom_fields ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- tags
ALTER TABLE tags ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE tags ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE tags ALTER COLUMN created_by TYPE TEXT USING created_by::text;

-- issue_tags
ALTER TABLE issue_tags ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE issue_tags ALTER COLUMN tag_id TYPE TEXT USING tag_id::text;
ALTER TABLE issue_tags ALTER COLUMN tagged_by TYPE TEXT USING tagged_by::text;

-- issue_templates
ALTER TABLE issue_templates ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE issue_templates ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE issue_templates ALTER COLUMN team_id TYPE TEXT USING team_id::text;
ALTER TABLE issue_templates ALTER COLUMN state_id TYPE TEXT USING state_id::text;
ALTER TABLE issue_templates ALTER COLUMN assignee_id TYPE TEXT USING assignee_id::text;
ALTER TABLE issue_templates ALTER COLUMN created_by TYPE TEXT USING created_by::text;
ALTER TABLE issue_templates ALTER COLUMN label_ids TYPE TEXT[] USING label_ids::text[];

-- project_templates
ALTER TABLE project_templates ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE project_templates ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE project_templates ALTER COLUMN created_by TYPE TEXT USING created_by::text;

-- issue_relations (drop CHECK that compares two UUID columns before converting)
ALTER TABLE issue_relations DROP CONSTRAINT issue_relation_not_self;
ALTER TABLE issue_relations ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE issue_relations ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE issue_relations ALTER COLUMN from_issue_id TYPE TEXT USING from_issue_id::text;
ALTER TABLE issue_relations ALTER COLUMN to_issue_id TYPE TEXT USING to_issue_id::text;
ALTER TABLE issue_relations ALTER COLUMN created_by TYPE TEXT USING created_by::text;
ALTER TABLE issue_relations ADD CONSTRAINT issue_relation_not_self CHECK (from_issue_id <> to_issue_id);

-- attachments
ALTER TABLE attachments ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE attachments ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE attachments ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE attachments ALTER COLUMN uploaded_by TYPE TEXT USING uploaded_by::text;

-- checklists
ALTER TABLE checklists ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE checklists ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE checklists ALTER COLUMN issue_id TYPE TEXT USING issue_id::text;
ALTER TABLE checklists ALTER COLUMN created_by TYPE TEXT USING created_by::text;

-- checklist_items
ALTER TABLE checklist_items ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE checklist_items ALTER COLUMN checklist_id TYPE TEXT USING checklist_id::text;
ALTER TABLE checklist_items ALTER COLUMN assignee_id TYPE TEXT USING assignee_id::text;

-- subscriptions
ALTER TABLE subscriptions ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE subscriptions ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;

-- license_keys
ALTER TABLE license_keys ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE license_keys ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE license_keys ALTER COLUMN issued_by TYPE TEXT USING issued_by::text;

-- coding_harness_keys
ALTER TABLE coding_harness_keys ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE coding_harness_keys ALTER COLUMN workspace_id TYPE TEXT USING workspace_id::text;
ALTER TABLE coding_harness_keys ALTER COLUMN created_by TYPE TEXT USING created_by::text;
ALTER TABLE coding_harness_keys ALTER COLUMN agent_user_id TYPE TEXT USING agent_user_id::text;

-- waitlist
ALTER TABLE waitlist ALTER COLUMN id TYPE TEXT USING id::text;

-- invite_codes
ALTER TABLE invite_codes ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE invite_codes ALTER COLUMN created_by TYPE TEXT USING created_by::text;

-- invite_code_redemptions
ALTER TABLE invite_code_redemptions ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE invite_code_redemptions ALTER COLUMN invite_code_id TYPE TEXT USING invite_code_id::text;
ALTER TABLE invite_code_redemptions ALTER COLUMN account_id TYPE TEXT USING account_id::text;

-- 5. Rewrite all PK values using the mapping table
UPDATE workspaces SET id = m.new_id FROM _id_map m WHERE workspaces.id = m.old_id;
UPDATE accounts SET id = m.new_id FROM _id_map m WHERE accounts.id = m.old_id;
UPDATE users SET id = m.new_id FROM _id_map m WHERE users.id = m.old_id;
UPDATE sessions SET id = m.new_id FROM _id_map m WHERE sessions.id = m.old_id;
UPDATE workflow_states SET id = m.new_id FROM _id_map m WHERE workflow_states.id = m.old_id;
UPDATE issues SET id = m.new_id FROM _id_map m WHERE issues.id = m.old_id;
UPDATE audit_log SET id = m.new_id FROM _id_map m WHERE audit_log.id = m.old_id;
UPDATE comments SET id = m.new_id FROM _id_map m WHERE comments.id = m.old_id;
UPDATE reactions SET id = m.new_id FROM _id_map m WHERE reactions.id = m.old_id;
UPDATE labels SET id = m.new_id FROM _id_map m WHERE labels.id = m.old_id;
UPDATE favorites SET id = m.new_id FROM _id_map m WHERE favorites.id = m.old_id;
UPDATE saved_views SET id = m.new_id FROM _id_map m WHERE saved_views.id = m.old_id;
UPDATE teams SET id = m.new_id FROM _id_map m WHERE teams.id = m.old_id;
UPDATE initiatives SET id = m.new_id FROM _id_map m WHERE initiatives.id = m.old_id;
UPDATE projects SET id = m.new_id FROM _id_map m WHERE projects.id = m.old_id;
UPDATE milestones SET id = m.new_id FROM _id_map m WHERE milestones.id = m.old_id;
UPDATE custom_fields SET id = m.new_id FROM _id_map m WHERE custom_fields.id = m.old_id;
UPDATE tags SET id = m.new_id FROM _id_map m WHERE tags.id = m.old_id;
UPDATE issue_templates SET id = m.new_id FROM _id_map m WHERE issue_templates.id = m.old_id;
UPDATE project_templates SET id = m.new_id FROM _id_map m WHERE project_templates.id = m.old_id;
UPDATE issue_relations SET id = m.new_id FROM _id_map m WHERE issue_relations.id = m.old_id;
UPDATE attachments SET id = m.new_id FROM _id_map m WHERE attachments.id = m.old_id;
UPDATE checklists SET id = m.new_id FROM _id_map m WHERE checklists.id = m.old_id;
UPDATE checklist_items SET id = m.new_id FROM _id_map m WHERE checklist_items.id = m.old_id;
UPDATE subscriptions SET id = m.new_id FROM _id_map m WHERE subscriptions.id = m.old_id;
UPDATE license_keys SET id = m.new_id FROM _id_map m WHERE license_keys.id = m.old_id;
UPDATE coding_harness_keys SET id = m.new_id FROM _id_map m WHERE coding_harness_keys.id = m.old_id;
UPDATE waitlist SET id = m.new_id FROM _id_map m WHERE waitlist.id = m.old_id;
UPDATE invite_codes SET id = m.new_id FROM _id_map m WHERE invite_codes.id = m.old_id;
UPDATE invite_code_redemptions SET id = m.new_id FROM _id_map m WHERE invite_code_redemptions.id = m.old_id;

-- 6. Rewrite all FK values using the mapping table
-- users FKs
UPDATE users SET workspace_id = m.new_id FROM _id_map m WHERE users.workspace_id = m.old_id;
UPDATE users SET account_id = m.new_id FROM _id_map m WHERE users.account_id = m.old_id;

-- account_credentials FK
UPDATE account_credentials SET account_id = m.new_id FROM _id_map m WHERE account_credentials.account_id = m.old_id;

-- sessions FKs
UPDATE sessions SET user_id = m.new_id FROM _id_map m WHERE sessions.user_id = m.old_id;
UPDATE sessions SET workspace_id = m.new_id FROM _id_map m WHERE sessions.workspace_id = m.old_id;
UPDATE sessions SET account_id = m.new_id FROM _id_map m WHERE sessions.account_id = m.old_id;

-- workflow_states FK
UPDATE workflow_states SET workspace_id = m.new_id FROM _id_map m WHERE workflow_states.workspace_id = m.old_id;

-- issue_key_counters FK
UPDATE issue_key_counters SET workspace_id = m.new_id FROM _id_map m WHERE issue_key_counters.workspace_id = m.old_id;

-- password_credentials FKs
UPDATE password_credentials SET user_id = m.new_id FROM _id_map m WHERE password_credentials.user_id = m.old_id;
UPDATE password_credentials SET workspace_id = m.new_id FROM _id_map m WHERE password_credentials.workspace_id = m.old_id;

-- issues FKs
UPDATE issues SET workspace_id = m.new_id FROM _id_map m WHERE issues.workspace_id = m.old_id;
UPDATE issues SET state_id = m.new_id FROM _id_map m WHERE issues.state_id = m.old_id;
UPDATE issues SET assignee_id = m.new_id FROM _id_map m WHERE issues.assignee_id = m.old_id;
UPDATE issues SET creator_id = m.new_id FROM _id_map m WHERE issues.creator_id = m.old_id;
UPDATE issues SET parent_id = m.new_id FROM _id_map m WHERE issues.parent_id = m.old_id;
UPDATE issues SET team_id = m.new_id FROM _id_map m WHERE issues.team_id = m.old_id;
UPDATE issues SET project_id = m.new_id FROM _id_map m WHERE issues.project_id = m.old_id;
UPDATE issues SET milestone_id = m.new_id FROM _id_map m WHERE issues.milestone_id = m.old_id;
UPDATE issues SET recurrence_source_id = m.new_id FROM _id_map m WHERE issues.recurrence_source_id = m.old_id;

-- issue_assignees FKs
UPDATE issue_assignees SET issue_id = m.new_id FROM _id_map m WHERE issue_assignees.issue_id = m.old_id;
UPDATE issue_assignees SET user_id = m.new_id FROM _id_map m WHERE issue_assignees.user_id = m.old_id;
UPDATE issue_assignees SET assigned_by = m.new_id FROM _id_map m WHERE issue_assignees.assigned_by = m.old_id;

-- audit_log FKs
UPDATE audit_log SET workspace_id = m.new_id FROM _id_map m WHERE audit_log.workspace_id = m.old_id;
UPDATE audit_log SET actor_user_id = m.new_id FROM _id_map m WHERE audit_log.actor_user_id = m.old_id;
UPDATE audit_log SET target_id = m.new_id FROM _id_map m WHERE audit_log.target_id = m.old_id;

-- comments FKs
UPDATE comments SET workspace_id = m.new_id FROM _id_map m WHERE comments.workspace_id = m.old_id;
UPDATE comments SET issue_id = m.new_id FROM _id_map m WHERE comments.issue_id = m.old_id;
UPDATE comments SET author_id = m.new_id FROM _id_map m WHERE comments.author_id = m.old_id;

-- comment_mentions FKs
UPDATE comment_mentions SET comment_id = m.new_id FROM _id_map m WHERE comment_mentions.comment_id = m.old_id;
UPDATE comment_mentions SET workspace_id = m.new_id FROM _id_map m WHERE comment_mentions.workspace_id = m.old_id;
UPDATE comment_mentions SET mentioned_user_id = m.new_id FROM _id_map m WHERE comment_mentions.mentioned_user_id = m.old_id;

-- reactions FKs
UPDATE reactions SET workspace_id = m.new_id FROM _id_map m WHERE reactions.workspace_id = m.old_id;
UPDATE reactions SET user_id = m.new_id FROM _id_map m WHERE reactions.user_id = m.old_id;
UPDATE reactions SET target_id = m.new_id FROM _id_map m WHERE reactions.target_id = m.old_id;

-- labels FKs
UPDATE labels SET workspace_id = m.new_id FROM _id_map m WHERE labels.workspace_id = m.old_id;

-- issue_labels FKs
UPDATE issue_labels SET workspace_id = m.new_id FROM _id_map m WHERE issue_labels.workspace_id = m.old_id;
UPDATE issue_labels SET issue_id = m.new_id FROM _id_map m WHERE issue_labels.issue_id = m.old_id;
UPDATE issue_labels SET label_id = m.new_id FROM _id_map m WHERE issue_labels.label_id = m.old_id;
UPDATE issue_labels SET attached_by = m.new_id FROM _id_map m WHERE issue_labels.attached_by = m.old_id;

-- favorites FKs
UPDATE favorites SET workspace_id = m.new_id FROM _id_map m WHERE favorites.workspace_id = m.old_id;
UPDATE favorites SET user_id = m.new_id FROM _id_map m WHERE favorites.user_id = m.old_id;
UPDATE favorites SET entity_id = m.new_id FROM _id_map m WHERE favorites.entity_id = m.old_id;

-- saved_views FKs
UPDATE saved_views SET workspace_id = m.new_id FROM _id_map m WHERE saved_views.workspace_id = m.old_id;
UPDATE saved_views SET creator_id = m.new_id FROM _id_map m WHERE saved_views.creator_id = m.old_id;

-- teams FK
UPDATE teams SET workspace_id = m.new_id FROM _id_map m WHERE teams.workspace_id = m.old_id;

-- team_members FKs
UPDATE team_members SET team_id = m.new_id FROM _id_map m WHERE team_members.team_id = m.old_id;
UPDATE team_members SET user_id = m.new_id FROM _id_map m WHERE team_members.user_id = m.old_id;

-- initiatives FK
UPDATE initiatives SET workspace_id = m.new_id FROM _id_map m WHERE initiatives.workspace_id = m.old_id;

-- projects FKs
UPDATE projects SET workspace_id = m.new_id FROM _id_map m WHERE projects.workspace_id = m.old_id;
UPDATE projects SET lead_id = m.new_id FROM _id_map m WHERE projects.lead_id = m.old_id;
UPDATE projects SET initiative_id = m.new_id FROM _id_map m WHERE projects.initiative_id = m.old_id;

-- project_teams FKs
UPDATE project_teams SET project_id = m.new_id FROM _id_map m WHERE project_teams.project_id = m.old_id;
UPDATE project_teams SET team_id = m.new_id FROM _id_map m WHERE project_teams.team_id = m.old_id;

-- milestones FKs
UPDATE milestones SET workspace_id = m.new_id FROM _id_map m WHERE milestones.workspace_id = m.old_id;
UPDATE milestones SET project_id = m.new_id FROM _id_map m WHERE milestones.project_id = m.old_id;

-- custom_fields FK
UPDATE custom_fields SET workspace_id = m.new_id FROM _id_map m WHERE custom_fields.workspace_id = m.old_id;

-- tags FKs
UPDATE tags SET workspace_id = m.new_id FROM _id_map m WHERE tags.workspace_id = m.old_id;
UPDATE tags SET created_by = m.new_id FROM _id_map m WHERE tags.created_by = m.old_id;

-- issue_tags FKs
UPDATE issue_tags SET issue_id = m.new_id FROM _id_map m WHERE issue_tags.issue_id = m.old_id;
UPDATE issue_tags SET tag_id = m.new_id FROM _id_map m WHERE issue_tags.tag_id = m.old_id;
UPDATE issue_tags SET tagged_by = m.new_id FROM _id_map m WHERE issue_tags.tagged_by = m.old_id;

-- issue_templates FKs
UPDATE issue_templates SET workspace_id = m.new_id FROM _id_map m WHERE issue_templates.workspace_id = m.old_id;
UPDATE issue_templates SET team_id = m.new_id FROM _id_map m WHERE issue_templates.team_id = m.old_id;
UPDATE issue_templates SET state_id = m.new_id FROM _id_map m WHERE issue_templates.state_id = m.old_id;
UPDATE issue_templates SET assignee_id = m.new_id FROM _id_map m WHERE issue_templates.assignee_id = m.old_id;
UPDATE issue_templates SET created_by = m.new_id FROM _id_map m WHERE issue_templates.created_by = m.old_id;

-- issue_templates.label_ids (UUID[] -> TEXT[], rewrite each element)
UPDATE issue_templates SET label_ids = (
  SELECT COALESCE(array_agg(COALESCE(m.new_id, elem)), '{}')
  FROM unnest(issue_templates.label_ids) AS elem
  LEFT JOIN _id_map m ON m.old_id = elem
) WHERE array_length(label_ids, 1) > 0;

-- project_templates FKs
UPDATE project_templates SET workspace_id = m.new_id FROM _id_map m WHERE project_templates.workspace_id = m.old_id;
UPDATE project_templates SET created_by = m.new_id FROM _id_map m WHERE project_templates.created_by = m.old_id;

-- issue_relations FKs
UPDATE issue_relations SET workspace_id = m.new_id FROM _id_map m WHERE issue_relations.workspace_id = m.old_id;
UPDATE issue_relations SET from_issue_id = m.new_id FROM _id_map m WHERE issue_relations.from_issue_id = m.old_id;
UPDATE issue_relations SET to_issue_id = m.new_id FROM _id_map m WHERE issue_relations.to_issue_id = m.old_id;
UPDATE issue_relations SET created_by = m.new_id FROM _id_map m WHERE issue_relations.created_by = m.old_id;

-- attachments FKs
UPDATE attachments SET workspace_id = m.new_id FROM _id_map m WHERE attachments.workspace_id = m.old_id;
UPDATE attachments SET issue_id = m.new_id FROM _id_map m WHERE attachments.issue_id = m.old_id;
UPDATE attachments SET uploaded_by = m.new_id FROM _id_map m WHERE attachments.uploaded_by = m.old_id;

-- checklists FKs
UPDATE checklists SET workspace_id = m.new_id FROM _id_map m WHERE checklists.workspace_id = m.old_id;
UPDATE checklists SET issue_id = m.new_id FROM _id_map m WHERE checklists.issue_id = m.old_id;
UPDATE checklists SET created_by = m.new_id FROM _id_map m WHERE checklists.created_by = m.old_id;

-- checklist_items FKs
UPDATE checklist_items SET checklist_id = m.new_id FROM _id_map m WHERE checklist_items.checklist_id = m.old_id;
UPDATE checklist_items SET assignee_id = m.new_id FROM _id_map m WHERE checklist_items.assignee_id = m.old_id;

-- subscriptions FK
UPDATE subscriptions SET workspace_id = m.new_id FROM _id_map m WHERE subscriptions.workspace_id = m.old_id;

-- license_keys FKs
UPDATE license_keys SET workspace_id = m.new_id FROM _id_map m WHERE license_keys.workspace_id = m.old_id;
UPDATE license_keys SET issued_by = m.new_id FROM _id_map m WHERE license_keys.issued_by = m.old_id;

-- coding_harness_keys FKs
UPDATE coding_harness_keys SET workspace_id = m.new_id FROM _id_map m WHERE coding_harness_keys.workspace_id = m.old_id;
UPDATE coding_harness_keys SET created_by = m.new_id FROM _id_map m WHERE coding_harness_keys.created_by = m.old_id;
UPDATE coding_harness_keys SET agent_user_id = m.new_id FROM _id_map m WHERE coding_harness_keys.agent_user_id = m.old_id;

-- invite_codes FKs
UPDATE invite_codes SET created_by = m.new_id FROM _id_map m WHERE invite_codes.created_by = m.old_id;

-- invite_code_redemptions FKs
UPDATE invite_code_redemptions SET invite_code_id = m.new_id FROM _id_map m WHERE invite_code_redemptions.invite_code_id = m.old_id;
UPDATE invite_code_redemptions SET account_id = m.new_id FROM _id_map m WHERE invite_code_redemptions.account_id = m.old_id;

-- 7. Recreate all FK constraints
-- accounts sub-tables
ALTER TABLE account_credentials ADD CONSTRAINT account_credentials_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

-- users
ALTER TABLE users ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

-- password_credentials
ALTER TABLE password_credentials ADD CONSTRAINT password_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE password_credentials ADD CONSTRAINT password_credentials_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- sessions
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

-- workflow_states
ALTER TABLE workflow_states ADD CONSTRAINT workflow_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- issue_key_counters
ALTER TABLE issue_key_counters ADD CONSTRAINT issue_key_counters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- issues
ALTER TABLE issues ADD CONSTRAINT issues_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE issues ADD CONSTRAINT issues_state_id_fkey FOREIGN KEY (state_id) REFERENCES workflow_states(id);
ALTER TABLE issues ADD CONSTRAINT issues_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE issues ADD CONSTRAINT issues_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_recurrence_source_id_fkey FOREIGN KEY (recurrence_source_id) REFERENCES issues(id) ON DELETE SET NULL;

-- issue_assignees
ALTER TABLE issue_assignees ADD CONSTRAINT issue_assignees_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_assignees ADD CONSTRAINT issue_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE issue_assignees ADD CONSTRAINT issue_assignees_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

-- audit_log
ALTER TABLE audit_log ADD CONSTRAINT audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- comments
ALTER TABLE comments ADD CONSTRAINT comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT;

-- comment_mentions
ALTER TABLE comment_mentions ADD CONSTRAINT comment_mentions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comment_mentions ADD CONSTRAINT comment_mentions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE comment_mentions ADD CONSTRAINT comment_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- reactions
ALTER TABLE reactions ADD CONSTRAINT reactions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE reactions ADD CONSTRAINT reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- labels
ALTER TABLE labels ADD CONSTRAINT labels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- issue_labels
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE;
ALTER TABLE issue_labels ADD CONSTRAINT issue_labels_attached_by_fkey FOREIGN KEY (attached_by) REFERENCES users(id) ON DELETE SET NULL;

-- favorites
ALTER TABLE favorites ADD CONSTRAINT favorites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- saved_views
ALTER TABLE saved_views ADD CONSTRAINT saved_views_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE saved_views ADD CONSTRAINT saved_views_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;

-- teams
ALTER TABLE teams ADD CONSTRAINT teams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- team_members
ALTER TABLE team_members ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE team_members ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- initiatives
ALTER TABLE initiatives ADD CONSTRAINT initiatives_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- projects
ALTER TABLE projects ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE projects ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT projects_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL;

-- project_teams
ALTER TABLE project_teams ADD CONSTRAINT project_teams_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_teams ADD CONSTRAINT project_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- milestones
ALTER TABLE milestones ADD CONSTRAINT milestones_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE milestones ADD CONSTRAINT milestones_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- custom_fields
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- tags
ALTER TABLE tags ADD CONSTRAINT tags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE tags ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- issue_tags
ALTER TABLE issue_tags ADD CONSTRAINT issue_tags_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_tags ADD CONSTRAINT issue_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE issue_tags ADD CONSTRAINT issue_tags_tagged_by_fkey FOREIGN KEY (tagged_by) REFERENCES users(id) ON DELETE SET NULL;

-- issue_templates
ALTER TABLE issue_templates ADD CONSTRAINT issue_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE issue_templates ADD CONSTRAINT issue_templates_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE issue_templates ADD CONSTRAINT issue_templates_state_id_fkey FOREIGN KEY (state_id) REFERENCES workflow_states(id) ON DELETE SET NULL;
ALTER TABLE issue_templates ADD CONSTRAINT issue_templates_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issue_templates ADD CONSTRAINT issue_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- project_templates
ALTER TABLE project_templates ADD CONSTRAINT project_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE project_templates ADD CONSTRAINT project_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- issue_relations
ALTER TABLE issue_relations ADD CONSTRAINT issue_relations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE issue_relations ADD CONSTRAINT issue_relations_from_issue_id_fkey FOREIGN KEY (from_issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_relations ADD CONSTRAINT issue_relations_to_issue_id_fkey FOREIGN KEY (to_issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE issue_relations ADD CONSTRAINT issue_relations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- attachments
ALTER TABLE attachments ADD CONSTRAINT attachments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD CONSTRAINT attachments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

-- checklists
ALTER TABLE checklists ADD CONSTRAINT checklists_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE checklists ADD CONSTRAINT checklists_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE;
ALTER TABLE checklists ADD CONSTRAINT checklists_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- checklist_items
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE;
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;

-- subscriptions
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id);

-- license_keys
ALTER TABLE license_keys ADD CONSTRAINT license_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE license_keys ADD CONSTRAINT license_keys_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES accounts(id);
ALTER TABLE license_keys ADD CONSTRAINT license_keys_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id);

-- coding_harness_keys
ALTER TABLE coding_harness_keys ADD CONSTRAINT coding_harness_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE coding_harness_keys ADD CONSTRAINT coding_harness_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES accounts(id);
ALTER TABLE coding_harness_keys ADD CONSTRAINT coding_harness_keys_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES users(id);

-- waitlist (no FKs)

-- invite_codes
ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES accounts(id);

-- invite_code_redemptions
ALTER TABLE invite_code_redemptions ADD CONSTRAINT invite_code_redemptions_invite_code_id_fkey FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id);
ALTER TABLE invite_code_redemptions ADD CONSTRAINT invite_code_redemptions_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

-- 8. Drop UUID defaults from PK columns (app now generates IDs)
ALTER TABLE workspaces ALTER COLUMN id DROP DEFAULT;
ALTER TABLE accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE sessions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE workflow_states ALTER COLUMN id DROP DEFAULT;
ALTER TABLE issues ALTER COLUMN id DROP DEFAULT;
ALTER TABLE audit_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE reactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE labels ALTER COLUMN id DROP DEFAULT;
ALTER TABLE favorites ALTER COLUMN id DROP DEFAULT;
ALTER TABLE saved_views ALTER COLUMN id DROP DEFAULT;
ALTER TABLE teams ALTER COLUMN id DROP DEFAULT;
ALTER TABLE initiatives ALTER COLUMN id DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN id DROP DEFAULT;
ALTER TABLE milestones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE custom_fields ALTER COLUMN id DROP DEFAULT;
ALTER TABLE tags ALTER COLUMN id DROP DEFAULT;
ALTER TABLE issue_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE project_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE issue_relations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE attachments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE checklists ALTER COLUMN id DROP DEFAULT;
ALTER TABLE checklist_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE subscriptions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE license_keys ALTER COLUMN id DROP DEFAULT;
ALTER TABLE coding_harness_keys ALTER COLUMN id DROP DEFAULT;
ALTER TABLE waitlist ALTER COLUMN id DROP DEFAULT;
ALTER TABLE invite_codes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE invite_code_redemptions ALTER COLUMN id DROP DEFAULT;

-- 9. Cleanup
DROP FUNCTION _nanoid(int);

COMMIT;
