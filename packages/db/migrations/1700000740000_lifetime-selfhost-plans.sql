-- Up Migration
-- Lifetime self-host licenses: a one-time purchase (no recurring per-seat sub)
-- that grants a commercial license to run xpntl on your own infra. Modeled as
-- plans so license_keys.plan_id can point at them; price_cents is the one-time
-- price (not per-seat/month), and features mark them self-host + lifetime.
-- max_users encodes the licensed seat ceiling (Indie ≤10; Company unlimited).

INSERT INTO plans (id, name, price_cents, max_users, max_projects, max_harness_keys, features)
VALUES
  ('selfhost_indie',   'Self-Host (Indie)',   39900, 10,   NULL, 2147483647,
   '{"self_host": true, "lifetime": true, "commercial_license": true, "mcp": true, "sso": true}'),
  ('selfhost_company', 'Self-Host (Company)', 199900, NULL, NULL, 2147483647,
   '{"self_host": true, "lifetime": true, "commercial_license": true, "mcp": true, "sso": true, "priority_support": true}')
ON CONFLICT (id) DO NOTHING;

-- Down Migration

DELETE FROM plans WHERE id IN ('selfhost_indie', 'selfhost_company');
