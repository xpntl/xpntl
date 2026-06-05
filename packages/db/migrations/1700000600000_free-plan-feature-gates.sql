-- Up Migration
--
-- Make feature gating actually work. requireFeature(ctx, flag) throws only when
-- plans.features[flag] === false, but the original seed never set these keys, so
-- the gated callsites (webhooks, CSV/Jira import, GitHub integration) passed for
-- everyone — including Free. Seed explicit `false` for these premium features on
-- the Free plan so the existing guards bite. Pro/Enterprise leave the keys unset
-- (→ allowed). Adjust the tier split here if pricing changes.

UPDATE plans
SET features = features || '{"webhooks": false, "csv_import": false, "github_integration": false}'::jsonb
WHERE id = 'free';

-- Down Migration

UPDATE plans
SET features = features - 'webhooks' - 'csv_import' - 'github_integration'
WHERE id = 'free';
