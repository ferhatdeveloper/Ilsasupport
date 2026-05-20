-- ============================================
-- TEK DOSYADA KURULUM — Supabase SQL Editor
-- Sira: 01 -> 02 -> 03_pg_runtime -> 04 -> 05
--
-- DÜZ PostgreSQL (Hono/Deno, auth/storage yok): BUNU ÇALIŞTIRMAYIN.
-- Bunun yerine: sql/00_README.txt → 00_plain + 01_standalone + 02_standalone + 03 + 04
-- veya: npm run db:schema  (.env.local içinde DATABASE_URL)
-- ============================================

-- ============================================
-- ILSA SUPPORT - Uygulama veritabanı (public)
-- ============================================
-- Kaynak: src/DATABASE_SETUP.sql (Supabase SQL Editor uyumlu)
-- ============================================

-- ====================
-- 1. USERS TABLOSU
-- ====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),

  registered_hardware_id TEXT,
  registered_device_info JSONB,
  registered_at TIMESTAMP WITH TIME ZONE,

  daily_downloads INTEGER DEFAULT 0,
  last_download_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_hardware_id ON users(registered_hardware_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- ====================
-- 2. SESSIONS TABLOSU
-- ====================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  hardware_id TEXT,
  user_agent TEXT,
  ip_address TEXT,
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- ====================
-- 3. ELECTRON TOKENS
-- ====================
CREATE TABLE IF NOT EXISTS electron_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hardware_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_electron_tokens_user_id ON electron_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_electron_tokens_expires_at ON electron_tokens(expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM electron_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ====================
-- 4. BRANDS / CATEGORIES / FILES / DOWNLOAD LINKS
-- ====================
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(brand_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_brand_id ON categories(brand_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  google_drive_link TEXT NOT NULL,
  file_size TEXT,
  version TEXT,
  required_plan TEXT DEFAULT 'free' CHECK (required_plan IN ('free', 'premium')),
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_category_id ON files(category_id);
CREATE INDEX IF NOT EXISTS idx_files_required_plan ON files(required_plan);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

CREATE TABLE IF NOT EXISTS download_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temp_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_links_file_id ON download_links(file_id);
CREATE INDEX IF NOT EXISTS idx_download_links_user_id ON download_links(user_id);
CREATE INDEX IF NOT EXISTS idx_download_links_token ON download_links(temp_token);
CREATE INDEX IF NOT EXISTS idx_download_links_expires_at ON download_links(expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_download_links()
RETURNS void AS $$
BEGIN
  DELETE FROM download_links WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ====================
-- RLS
-- ====================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (id = auth.uid());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sessions" ON sessions;
CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE electron_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tokens" ON electron_tokens;
CREATE POLICY "Users can read own tokens"
  ON electron_tokens FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read files" ON files;
CREATE POLICY "Everyone can read files"
  ON files FOR SELECT
  USING (true);

ALTER TABLE download_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own download links" ON download_links;
CREATE POLICY "Users can read own download links"
  ON download_links FOR SELECT
  USING (user_id = auth.uid());

-- ====================
-- updated_at trigger
-- ====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- ILSA SUPPORT — Legacy içerik şeması (Türkçe tablolar)
-- ============================================
-- Kullanıldığı yerler:
--   src/supabase/functions/server/postgresql_helpers.tsx
--   src/supabase/functions/server/migrate_json_to_postgresql.tsx
--   src/supabase/functions/server/admin_endpoints.tsx
-- ============================================

-- Kategori ağacı: ust_kategori_id NULL = marka (root), aksi = alt kategori
CREATE TABLE IF NOT EXISTS kategoriler (
  id SERIAL PRIMARY KEY,
  kategori_adi TEXT NOT NULL,
  ust_kategori_id INTEGER REFERENCES kategoriler(id) ON DELETE SET NULL,
  aciklama TEXT DEFAULT '',
  resim TEXT,
  sira INTEGER DEFAULT 0,
  durum TEXT NOT NULL DEFAULT 'active',
  eklenme_tarihi TIMESTAMPTZ DEFAULT NOW(),
  legacy_altkat TEXT,
  legacy_alkat2 TEXT,
  slug TEXT
);

CREATE INDEX IF NOT EXISTS idx_kategoriler_ust ON kategoriler(ust_kategori_id);
CREATE INDEX IF NOT EXISTS idx_kategoriler_durum ON kategoriler(durum);
CREATE INDEX IF NOT EXISTS idx_kategoriler_adi ON kategoriler(kategori_adi);
CREATE INDEX IF NOT EXISTS idx_kategoriler_legacy_alkat2 ON kategoriler(legacy_alkat2);

-- Dosya / bilgi kayıtları
CREATE TABLE IF NOT EXISTS bilgi (
  id SERIAL PRIMARY KEY,
  katid TEXT,
  altkat TEXT,
  adi TEXT NOT NULL DEFAULT 'Bilinmeyen Dosya',
  boyut TEXT DEFAULT '',
  link TEXT DEFAULT '',
  link2 TEXT DEFAULT '',
  link3 TEXT DEFAULT '',
  tarih TIMESTAMPTZ DEFAULT NOW(),
  hit INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  asama TEXT DEFAULT '',
  bildiri TEXT DEFAULT '',
  renkodu TEXT DEFAULT '#008000'
);

CREATE INDEX IF NOT EXISTS idx_bilgi_katid ON bilgi(katid);
CREATE INDEX IF NOT EXISTS idx_bilgi_altkat ON bilgi(altkat);
CREATE INDEX IF NOT EXISTS idx_bilgi_adi ON bilgi(adi);

-- Admin istatistikleri / kullanıcı indirme geçmişi (PostgreSQL tarafı)
CREATE TABLE IF NOT EXISTS indirme_gecmisi (
  id BIGSERIAL PRIMARY KEY,
  kullanici_id TEXT NOT NULL,
  dosya_id INTEGER NOT NULL REFERENCES bilgi(id) ON DELETE CASCADE,
  kategori_id INTEGER REFERENCES kategoriler(id) ON DELETE SET NULL,
  dosya_boyutu TEXT,
  indirilme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indirme_kullanici ON indirme_gecmisi(kullanici_id);
CREATE INDEX IF NOT EXISTS idx_indirme_dosya ON indirme_gecmisi(dosya_id);
CREATE INDEX IF NOT EXISTS idx_indirme_tarih ON indirme_gecmisi(indirilme_tarihi DESC);

-- Basit okuma politikaları (uygulama çoğunlukla service_role kullanır; anon için katalog okunabilir)
ALTER TABLE kategoriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE bilgi ENABLE ROW LEVEL SECURITY;
ALTER TABLE indirme_gecmisi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read kategoriler" ON kategoriler;
CREATE POLICY "Public read kategoriler"
  ON kategoriler FOR SELECT
  USING (durum = 'active');

DROP POLICY IF EXISTS "kategoriler_api_insert" ON kategoriler;
CREATE POLICY "kategoriler_api_insert" ON kategoriler FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "kategoriler_api_update" ON kategoriler;
CREATE POLICY "kategoriler_api_update" ON kategoriler FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "kategoriler_api_delete" ON kategoriler;
CREATE POLICY "kategoriler_api_delete" ON kategoriler FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public read bilgi" ON bilgi;
CREATE POLICY "Public read bilgi"
  ON bilgi FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users read own indirme_gecmisi" ON indirme_gecmisi;
CREATE POLICY "Users read own indirme_gecmisi"
  ON indirme_gecmisi FOR SELECT
  USING (kullanici_id = auth.uid()::text);


-- ============================================
-- KV tablosu YOK: ayrı ilişkisel tablolar (03_pg_runtime_tables)
-- ============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_profile JSONB DEFAULT '{}'::jsonb;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS access_token_snapshot TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS session_token_lookup (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_token_user ON session_token_lookup(user_id);

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

CREATE TABLE IF NOT EXISTS download_gates (
  token TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  speed TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

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

DROP TABLE IF EXISTS app_ephemeral;
DROP TABLE IF EXISTS kv_store_47081311;


-- ============================================
-- RPC ve yardımcı fonksiyonlar
-- ============================================
-- db_helpers.tsx        → increment(...)
-- postgresql_helpers.tsx → increment_file_hit, increment_file_down
-- ============================================

-- files.download_count için (UUID satır)
CREATE OR REPLACE FUNCTION increment(
  row_id UUID,
  table_name TEXT,
  column_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF table_name = 'files' AND column_name = 'download_count' THEN
    UPDATE files
    SET download_count = COALESCE(download_count, 0) + 1
    WHERE id = row_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION increment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment(UUID, TEXT, TEXT) TO service_role;

-- bilgi.hit
CREATE OR REPLACE FUNCTION increment_file_hit(file_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bilgi
  SET hit = COALESCE(hit, 0) + 1
  WHERE id = file_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_file_hit(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_file_hit(INTEGER) TO service_role;

-- bilgi.down
CREATE OR REPLACE FUNCTION increment_file_down(file_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bilgi
  SET down = COALESCE(down, 0) + 1
  WHERE id = file_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_file_down(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_file_down(INTEGER) TO service_role;


-- ============================================
-- Storage: JSON dosyaları bucket'ı
-- ============================================
-- Kullanıldığı yer: index.tsx, migrate_json_to_postgresql.tsx
--   supabase.storage.from('json-files')
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('json-files', 'json-files', false)
ON CONFLICT (id) DO NOTHING;

-- Service role zaten tam yetkili; geliştirme için authenticated yükleme gerekiyorsa açın:
-- CREATE POLICY "Authenticated upload json-files"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'json-files');

-- ============================================
-- CMS: slaytlar + bilgi sayfaları (ayrıca sql/09_cms_content.sql)
-- ============================================
CREATE TABLE IF NOT EXISTS cms_hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT '',
  button_url TEXT NOT NULL DEFAULT '#',
  image_url TEXT NOT NULL DEFAULT '',
  gradient TEXT NOT NULL DEFAULT 'from-blue-900 via-purple-900 to-pink-900',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cms_hero_slides_active_sort
  ON cms_hero_slides (is_active, sort_order, created_at);

CREATE TABLE IF NOT EXISTS cms_info_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cms_info_pages_published_created
  ON cms_info_pages (is_published, created_at DESC);

CREATE TABLE IF NOT EXISTS cms_pricing_page (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
