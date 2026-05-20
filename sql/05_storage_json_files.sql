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
