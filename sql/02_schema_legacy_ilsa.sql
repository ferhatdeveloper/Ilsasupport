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

-- Dosya / bilgi kayıtları (Ilsasupport-php mysqldump: bilgi.katid / altkat varchar)
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

-- Deno API (DATABASE_URL ile postgres.js): INSERT/UPDATE/DELETE için ayrı politika yoksa
-- tablo sahibi olmayan DB rolünde RLS "new row violates row-level security" hatası oluşur.
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
