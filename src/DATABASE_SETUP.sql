-- ============================================
-- ILSA SUPPORT - DATABASE SETUP
-- ============================================
-- Bu SQL kodunu Supabase Dashboard'da çalıştırın:
-- 1. Supabase Dashboard > SQL Editor
-- 2. "New Query" tıklayın
-- 3. Bu kodu yapıştırın
-- 4. "Run" tıklayın
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
  
  -- 🔒 Hardware Lock Alanları
  registered_hardware_id TEXT,
  registered_device_info JSONB,
  registered_at TIMESTAMP WITH TIME ZONE,
  
  -- 📊 İndirme Limitleri
  daily_downloads INTEGER DEFAULT 0,
  last_download_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 📅 Tarihler
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Eski şema: CREATE TABLE IF NOT EXISTS mevcut tabloyu değiştirmez; username kolonu eksikse ekle ve doldur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

UPDATE users SET username = lower(regexp_replace(
  trim(split_part(coalesce(email, ''), '@', 1)),
  '[^a-z0-9_]', '_', 'g'
))
WHERE (username IS NULL OR btrim(username) = '')
  AND coalesce(email, '') <> ''
  AND position('@' in email::text) > 0
  AND length(lower(regexp_replace(trim(split_part(email, '@', 1)), '[^a-z0-9_]', '_', 'g'))) BETWEEN 3 AND 32;

UPDATE users SET username = ('u' || substring(replace(id::text, '-', '') from 1 for 12))
WHERE username IS NULL OR btrim(username) = '' OR length(btrim(username)) < 3
  OR lower(username) !~ '^[a-z0-9_]{3,32}$';

UPDATE users u SET username = substring(replace(u.id::text, '-', '') from 1 for 32)
WHERE u.id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY lower(btrim(username)) ORDER BY id) AS rn
    FROM users
  ) s WHERE rn > 1
);

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Index'ler (Performans için; IF NOT EXISTS ile tekrar çalıştırılabilir)
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

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- ====================
-- 3. ELECTRON TOKENS TABLOSU
-- ====================
CREATE TABLE IF NOT EXISTS electron_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hardware_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_electron_tokens_user_id ON electron_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_electron_tokens_expires_at ON electron_tokens(expires_at);

-- Otomatik süresi dolmuş token temizleme (Her gün 03:00'da)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM electron_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ====================
-- 4. BRANDS TABLOSU
-- ====================
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);

-- ====================
-- 5. CATEGORIES TABLOSU
-- ====================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(brand_id, name)
);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_categories_brand_id ON categories(brand_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- ====================
-- 6. FILES TABLOSU
-- ====================
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

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_files_category_id ON files(category_id);
CREATE INDEX IF NOT EXISTS idx_files_required_plan ON files(required_plan);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);

-- ====================
-- 7. DOWNLOAD LINKS TABLOSU
-- ====================
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

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_download_links_file_id ON download_links(file_id);
CREATE INDEX IF NOT EXISTS idx_download_links_user_id ON download_links(user_id);
CREATE INDEX IF NOT EXISTS idx_download_links_token ON download_links(temp_token);
CREATE INDEX IF NOT EXISTS idx_download_links_expires_at ON download_links(expires_at);

-- Otomatik süresi dolmuş link temizleme
CREATE OR REPLACE FUNCTION cleanup_expired_download_links()
RETURNS void AS $$
BEGIN
  DELETE FROM download_links WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ====================
-- 8. RLS (Row Level Security) POLİCY'LERİ
-- ====================
-- Policy'ler auth.uid() kullanır (Supabase PostgREST / JWT). Düz PostgreSQL'de
-- auth şeması yoktur; yalnızca auth.uid() henüz tanımlı değilse güvenli stub eklenir.
-- Supabase projelerinde gerçek auth.uid() varsa bu blok hiçbir şey yapmaz (üzerine yazılmaz).

DO $ensure_auth_uid$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;

  CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $stub$SELECT NULL::uuid$stub$;
END;
$ensure_auth_uid$;

-- Users tablosu RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (true); -- Public read (frontend'de user listesi göstermek için)

DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- Sessions tablosu RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sessions" ON sessions;
CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Electron tokens RLS
ALTER TABLE electron_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own tokens" ON electron_tokens;
CREATE POLICY "Users can read own tokens"
  ON electron_tokens FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Files tablosu RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read files" ON files;
CREATE POLICY "Everyone can read files"
  ON files FOR SELECT
  USING (true);

-- Download links RLS
ALTER TABLE download_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own download links" ON download_links;
CREATE POLICY "Users can read own download links"
  ON download_links FOR SELECT
  USING (user_id = auth.uid());

-- ====================
-- 9. TRIGGER'LAR
-- ====================

-- Updated_at otomatik güncellemesi
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

-- ====================
-- 10. DEMO DATA (OPSIYONEL)
-- ====================

-- Admin kullanıcısı (şifre: Admin123456!)
-- Not: Şifre hashini backend'den almalısınız
-- INSERT INTO users (email, password_hash, name, role, plan) VALUES
-- ('admin@ilsasupport.com', '$2a$10$...', 'Admin Demo', 'admin', 'premium');

-- ====================
-- ✅ KURULUM TAMAMLANDI!
-- ====================

-- Tabloları kontrol et:
SELECT 
  schemaname, 
  tablename, 
  tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'sessions', 'electron_tokens', 'brands', 'categories', 'files', 'download_links')
ORDER BY tablename;

-- Index'leri kontrol et:
SELECT 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'sessions', 'electron_tokens', 'brands', 'categories', 'files', 'download_links')
ORDER BY tablename, indexname;

-- ============================================
-- 🎉 KURULUM BAŞARILI!
-- ============================================
-- Artık backend kodunu SQL tabloları kullanacak şekilde güncelleyebilirsiniz.
-- /supabase/functions/server/index.tsx dosyasını güncelleyin.
-- ============================================
