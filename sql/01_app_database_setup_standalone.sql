-- ============================================
-- ILSA SUPPORT — Uygulama şeması (RLS YOK, auth.uid YOK)
-- Yerel PostgreSQL + Hono/Deno API için.
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

-- RLS kapalı: API sunucusu postgres kullanıcısı ile bağlanır.

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
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();
