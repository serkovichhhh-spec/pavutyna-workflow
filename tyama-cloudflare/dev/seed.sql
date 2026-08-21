-- LOCAL DEVELOPMENT ONLY. Never apply this file to production.
INSERT OR IGNORE INTO hosts (id, email, display_name)
VALUES ('host_dev', 'dev@tyama.local', 'Тестовий ведучий');

INSERT OR REPLACE INTO sessions (id, host_id, token_hash, expires_at)
VALUES (
  'session_dev',
  'host_dev',
  'ace88836b5e6b5a6028ec6fabbcbc2911e74d79407dcdf01e623b52a26720ddc',
  '2099-01-01T00:00:00Z'
);

-- Raw local cookie value: tyama-dev-session
