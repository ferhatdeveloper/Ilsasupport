-- ============================================
-- Düz PostgreSQL (Supabase yok) — ön koşullar
-- 01_app_database_setup_standalone.sql öncesi bir kez çalıştırın.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 04_rpc_and_helpers.sql içindeki GRANT ... TO service_role hedefi
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;
