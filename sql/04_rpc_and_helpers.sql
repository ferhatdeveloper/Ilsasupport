-- ============================================
-- RPC ve yardımcı fonksiyonlar
-- ============================================
-- db_helpers.tsx        → increment(...)
-- postgresql_helpers.tsx → increment_file_hit, increment_file_down
-- ============================================

-- files.download_count için (UUID satır)
CREATE OR REPLACE FUNCTION increment(
  row_id UUID,
  table_name TEXT,
  column_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF table_name = 'files' AND column_name = 'download_count' THEN
    UPDATE files
    SET download_count = COALESCE(download_count, 0) + 1
    WHERE id = row_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION increment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment(UUID, TEXT, TEXT) TO service_role;

-- bilgi.hit
CREATE OR REPLACE FUNCTION increment_file_hit(file_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bilgi
  SET hit = COALESCE(hit, 0) + 1
  WHERE id = file_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_file_hit(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_file_hit(INTEGER) TO service_role;

-- bilgi.down
CREATE OR REPLACE FUNCTION increment_file_down(file_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bilgi
  SET down = COALESCE(down, 0) + 1
  WHERE id = file_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_file_down(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_file_down(INTEGER) TO service_role;
