-- Masaüstü → tarayıcı tek kullanımlık oturum aktarımı
CREATE TABLE IF NOT EXISTS browser_handoffs (
  handoff_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_handoffs_exp ON browser_handoffs(expires_at);
