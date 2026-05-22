-- Performans: eşzamanlı giriş ve dosya listesi
-- psql veya: node scripts/pg-run-single-sql.cjs sql/12_performance_indexes.sql

CREATE INDEX IF NOT EXISTS idx_bilgi_id_desc ON bilgi (id DESC);
CREATE INDEX IF NOT EXISTS idx_bilgi_katid ON bilgi (katid);
CREATE INDEX IF NOT EXISTS idx_bilgi_altkat ON bilgi (altkat);
CREATE INDEX IF NOT EXISTS idx_bilgi_katid_altkat ON bilgi (katid, altkat);

CREATE INDEX IF NOT EXISTS idx_jwt_sessions_active
  ON jwt_access_sessions (jti)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jwt_sessions_user_active
  ON jwt_access_sessions (user_id, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_web_presence_active
  ON web_presence_sessions (user_id, last_seen_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_login_events_ip_created
  ON login_events (ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_login_events_created
  ON login_events (created_at DESC);
