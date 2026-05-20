-- JWT: tek kullanımlık oturum kayıtları (jti ile kullanıcı eşlemesi)
CREATE TABLE IF NOT EXISTS jwt_access_sessions (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  replaced_by_jti UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jwt_access_sessions_user_active
  ON jwt_access_sessions(user_id)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jwt_access_sessions_expires
  ON jwt_access_sessions(expires_at)
  WHERE consumed_at IS NULL;
