-- ============================================
-- CMS: Ana sayfa slaytları + bilgi sayfaları
-- Sıra: 04_rpc_and_helpers.sql sonrası (npm run db:schema ile otomatik uygulanır)
-- Supabase tek dosya: 99_all_in_one.sql içinde de yer alır
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
