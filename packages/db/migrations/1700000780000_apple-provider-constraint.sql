-- Up Migration
-- account_providers.provider_check was first created without 'apple', and
-- 'apple' was later added by editing the sso-auth migration in place. Edited
-- migrations are never re-run by node-pg-migrate, so prod still rejects
-- provider='apple' ("new row for relation account_providers violates check
-- constraint provider_check") the moment Apple Sign In succeeds. Recreate the
-- constraint as a fresh migration so it actually applies everywhere.

ALTER TABLE account_providers DROP CONSTRAINT IF EXISTS provider_check;
ALTER TABLE account_providers
  ADD CONSTRAINT provider_check
  CHECK (provider IN ('password','google','github','microsoft','apple'));

-- Down Migration

ALTER TABLE account_providers DROP CONSTRAINT IF EXISTS provider_check;
ALTER TABLE account_providers
  ADD CONSTRAINT provider_check
  CHECK (provider IN ('password','google','github','microsoft'));
