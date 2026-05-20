-- ============================================
-- Legacy içerik şeması (RLS YOK) — düz PostgreSQL
-- ============================================

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
