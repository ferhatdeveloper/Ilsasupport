-- Paket fiyatları sayfası (tek satır JSON)
-- npm run db:schema ile uygulanır (scripts/apply-pg-schema.cjs)

CREATE TABLE IF NOT EXISTS cms_pricing_page (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
