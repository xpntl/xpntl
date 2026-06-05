UPDATE accounts SET is_super_admin = true, updated_at = now()
WHERE email IN ('kholland@centrixiq.com', 'use@xpntl.dev');

UPDATE users SET is_super_admin = true, updated_at = now()
WHERE account_id IN (
  SELECT id FROM accounts WHERE email IN ('kholland@centrixiq.com', 'use@xpntl.dev')
);
