-- ============================================
-- KV tablosu YOK: ayrı ilişkisel tablolar
-- (01_app_database_setup.sql sonrası çalıştırın)
-- ============================================

-- Kullanıcı profilinde KV’den kalan ek alanlar
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_profile JSONB DEFAULT '{}'::jsonb;

-- Oturum ek verisi (accessToken, tokenHash, isValid, usageCount, …)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS access_token_snapshot TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Bearer hash → oturum (user_id + device_id = sessions.device_id)
CREATE TABLE IF NOT EXISTS session_token_lookup (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_token_user ON session_token_lookup(user_id);

-- ---------- Demo katalog (KV category:/subcategory:/file: yerine) ----------
CREATE TABLE IF NOT EXISTS demo_categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT DEFAULT '📱',
  description TEXT DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE IF NOT EXISTS demo_subcategories (
  id UUID PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES demo_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📁',
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_subcat_category ON demo_subcategories(category_id);

CREATE TABLE IF NOT EXISTS demo_files (
  id UUID PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES demo_categories(id) ON DELETE CASCADE,
  subcategory_id UUID NOT NULL REFERENCES demo_subcategories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_type TEXT DEFAULT 'firmware',
  version TEXT,
  size BIGINT,
  download_url TEXT NOT NULL,
  is_premium BOOLEAN DEFAULT false,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_files_subcat ON demo_files(subcategory_id);

-- ---------- İndirme: geçit token’ı (download:<uuid>) ----------
CREATE TABLE IF NOT EXISTS download_gates (
  token TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  speed TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------- İndirme: kullanıcı geçmişi (download:<userId>:<recordId>) ----------
CREATE TABLE IF NOT EXISTS user_download_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT,
  category_name TEXT,
  subcategory_name TEXT,
  file_type TEXT,
  size TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  hidden_from_user BOOLEAN NOT NULL DEFAULT false,
  hidden_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_udh_user ON user_download_history(user_id, downloaded_at DESC);

-- ---------- Tek kullanımlık dosya indirme (download_token: / downloadsession:) ----------
CREATE TABLE IF NOT EXISTS file_download_tokens (
  token TEXT PRIMARY KEY,
  session_kind TEXT NOT NULL DEFAULT 'otp' CHECK (session_kind IN ('otp', 'browser_session')),
  file_id TEXT NOT NULL,
  user_id TEXT,
  google_drive_url TEXT,
  direct_link TEXT,
  drive_file_id TEXT,
  file_name TEXT,
  file_size TEXT,
  ip_address TEXT,
  link_type TEXT,
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_download_tokens_exp ON file_download_tokens(expires_at);

-- ---------- Uzaktan destek ----------
CREATE TABLE IF NOT EXISTS support_requests (
  support_id TEXT PRIMARY KEY,
  request_id UUID NOT NULL,
  supporter_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS support_sessions (
  session_id UUID PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES support_requests(support_id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------- WebRTC ayrı tablolar ----------
CREATE TABLE IF NOT EXISTS webrtc_offers (
  support_id TEXT PRIMARY KEY,
  offer TEXT NOT NULL,
  created_ms BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS webrtc_answers (
  support_id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  created_ms BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS webrtc_ice_candidates (
  support_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (support_id, sender)
);

CREATE TABLE IF NOT EXISTS webrtc_connection_status (
  support_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_ms BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (support_id, sender)
);

-- Eski KV / geçici tablolar (varsa) kaldır
DROP TABLE IF EXISTS app_ephemeral;
DROP TABLE IF EXISTS kv_store_47081311;
