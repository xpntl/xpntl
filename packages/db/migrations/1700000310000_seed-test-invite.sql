INSERT INTO invite_codes (id, code, max_uses, use_count)
VALUES ('test-invite-001', 'XPNTL-TESTCODE', 999999, 0)
ON CONFLICT (code) DO NOTHING;
