-- Favoriler ve dosya istekleri
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT,
  file_meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS file_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand_hint TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'done', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_requests_user ON file_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_requests_status ON file_requests(status, created_at DESC);
