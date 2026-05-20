-- bilgi.link / link2 / link3 içindeki Google Drive adreslerini ve düz dosya kimliklerini
-- uygulamanın kullandığı usercontent biçimine çevirir:
--   https://drive.usercontent.google.com/download?id=FILE_ID&export=download&authuser=0
--
-- Çalıştırmadan önce yedek alın. İdempotent: zaten usercontent olan satırlar aynı id ile yeniden yazılır.
-- Uygulama tarafında google_drive_helper.extractFileIdFromDriveUrl ile uyumlu kurallar.

CREATE OR REPLACE FUNCTION _migration_drive_to_usercontent(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  t text;
  fid text;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  t := btrim(p);
  IF t = '' THEN
    RETURN p;
  END IF;

  IF t ~* '/file/d/[A-Za-z0-9_-]+' THEN
    fid := (regexp_match(t, '/file/d/([A-Za-z0-9_-]+)'))[1];
    RETURN 'https://drive.usercontent.google.com/download?id=' || fid || '&export=download&authuser=0';
  END IF;

  IF (regexp_match(t, 'uc\?id=([A-Za-z0-9_-]+)')) IS NOT NULL THEN
    fid := (regexp_match(t, 'uc\?id=([A-Za-z0-9_-]+)'))[1];
    RETURN 'https://drive.usercontent.google.com/download?id=' || fid || '&export=download&authuser=0';
  END IF;

  IF t ~* 'https?://(drive\.google\.com|drive\.usercontent\.google\.com)' AND t ~ '[?&]id=([A-Za-z0-9_-]+)' THEN
    fid := (regexp_match(t, '[?&]id=([A-Za-z0-9_-]+)'))[1];
    RETURN 'https://drive.usercontent.google.com/download?id=' || fid || '&export=download&authuser=0';
  END IF;

  IF t !~ '[\\/]' AND t !~ '^[Hh][Tt][Tt][Pp][Ss]?:' AND t ~ '^[A-Za-z0-9_-]{15,80}$' THEN
    RETURN 'https://drive.usercontent.google.com/download?id=' || t || '&export=download&authuser=0';
  END IF;

  RETURN p;
END;
$fn$;

UPDATE bilgi b
SET link = _migration_drive_to_usercontent(b.link)
WHERE b.link IS NOT NULL
  AND b.link <> ''
  AND _migration_drive_to_usercontent(b.link) IS DISTINCT FROM b.link;

UPDATE bilgi b
SET link2 = _migration_drive_to_usercontent(b.link2)
WHERE b.link2 IS NOT NULL
  AND b.link2 <> ''
  AND _migration_drive_to_usercontent(b.link2) IS DISTINCT FROM b.link2;

UPDATE bilgi b
SET link3 = _migration_drive_to_usercontent(b.link3)
WHERE b.link3 IS NOT NULL
  AND b.link3 <> ''
  AND _migration_drive_to_usercontent(b.link3) IS DISTINCT FROM b.link3;

DROP FUNCTION _migration_drive_to_usercontent(text);
