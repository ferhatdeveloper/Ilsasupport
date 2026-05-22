-- Türkçe arama (TRANSLATE+LOWER) ile uyumlu trigram indeksleri
-- Uygulama: node scripts/pg-run-single-sql.cjs sql/20_search_trgm_indexes.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_bilgi_search_norm_trgm ON bilgi USING gin (
  REPLACE(
    LOWER(TRANSLATE(COALESCE(adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')),
    'i̇',
    'i'
  ) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS idx_kategoriler_search_norm_trgm ON kategoriler USING gin (
  REPLACE(
    LOWER(TRANSLATE(COALESCE(kategori_adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')),
    'i̇',
    'i'
  ) gin_trgm_ops
);
