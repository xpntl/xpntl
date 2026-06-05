-- Up Migration
-- Rename the top paid plan from "enterprise" to "ultra". The old name implied an
-- organization type when it's really just a feature tier. plans.id is a PK
-- referenced by subscriptions.plan_id and license_keys.plan_id (FKs without
-- ON UPDATE CASCADE), so we copy the row under the new id, repoint the children,
-- then drop the old row. Idempotent on a fresh DB (which seeds 'enterprise' first).

INSERT INTO plans (id, name, price_cents, max_users, max_projects, max_harness_keys, features, created_at)
SELECT 'ultra', 'Ultra', price_cents, max_users, max_projects, max_harness_keys, features, created_at
FROM plans WHERE id = 'enterprise'
ON CONFLICT (id) DO NOTHING;

UPDATE subscriptions SET plan_id = 'ultra' WHERE plan_id = 'enterprise';
UPDATE license_keys  SET plan_id = 'ultra' WHERE plan_id = 'enterprise';

DELETE FROM plans WHERE id = 'enterprise';

-- Down Migration

INSERT INTO plans (id, name, price_cents, max_users, max_projects, max_harness_keys, features, created_at)
SELECT 'enterprise', 'Enterprise', price_cents, max_users, max_projects, max_harness_keys, features, created_at
FROM plans WHERE id = 'ultra'
ON CONFLICT (id) DO NOTHING;

UPDATE subscriptions SET plan_id = 'enterprise' WHERE plan_id = 'ultra';
UPDATE license_keys  SET plan_id = 'enterprise' WHERE plan_id = 'ultra';

DELETE FROM plans WHERE id = 'ultra';
