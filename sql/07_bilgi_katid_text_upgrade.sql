-- Zaten 02_schema_legacy_ilsa.sql ile TEXT olarak kurduysanız ATLAYIN.
-- Eski kurulumda bilgi.katid / altkat INTEGER ise PHP/MySQL uyumu için TEXT'e çevirin.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bilgi' AND column_name = 'katid'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE bilgi ALTER COLUMN katid TYPE TEXT USING katid::text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bilgi' AND column_name = 'altkat'
      AND data_type IN ('integer', 'bigint', 'smallint')
  ) THEN
    ALTER TABLE bilgi ALTER COLUMN altkat TYPE TEXT USING altkat::text;
  END IF;
END $$;

UPDATE bilgi SET katid = NULL WHERE katid = '';
UPDATE bilgi SET altkat = NULL WHERE altkat = '';
