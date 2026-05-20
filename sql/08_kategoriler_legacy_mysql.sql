-- MySQL kategoriler tablosundaki altkat / alkat2 ve slug (PHP Home::Soft / Home::alt / ara.wizard)
ALTER TABLE kategoriler ADD COLUMN IF NOT EXISTS legacy_altkat TEXT;
ALTER TABLE kategoriler ADD COLUMN IF NOT EXISTS legacy_alkat2 TEXT;
ALTER TABLE kategoriler ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE INDEX IF NOT EXISTS idx_kategoriler_legacy_alkat2 ON kategoriler(legacy_alkat2);
