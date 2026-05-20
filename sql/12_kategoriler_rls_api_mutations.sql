-- Mevcut veritabanında kategoriler RLS açık ve yalnızca SELECT politikası varsa
-- Deno API ile INSERT "row-level security" hatasına düşer. Bu dosyayı bir kez çalıştırın.
-- (Yeni kurulumlarda 02_schema_legacy_ilsa.sql / 99_all_in_one.sql içinde zaten vardır.)

DROP POLICY IF EXISTS "kategoriler_api_insert" ON public.kategoriler;
CREATE POLICY "kategoriler_api_insert" ON public.kategoriler FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "kategoriler_api_update" ON public.kategoriler;
CREATE POLICY "kategoriler_api_update" ON public.kategoriler FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "kategoriler_api_delete" ON public.kategoriler;
CREATE POLICY "kategoriler_api_delete" ON public.kategoriler FOR DELETE USING (true);
