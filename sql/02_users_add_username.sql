-- ============================================
-- Migration: users tablosuna username, email isteğe bağlı
-- Eski kurulumlarda (email UNIQUE NOT NULL) bir kez çalıştırın.
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users SET username = lower(
  regexp_replace(
    split_part(coalesce(nullif(trim(email), ''), 'x'), '@', 1),
    '[^a-z0-9_]',
    '_',
    'g'
  )
) || '_' || substring(replace(id::text, '-', '') from 1 for 8)
WHERE username IS NULL OR btrim(username) = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

DROP INDEX IF EXISTS idx_users_email;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
