-- Masaüstü portable: zorunlu minimum sürüm ve indirme yolu (tek satır)
CREATE TABLE IF NOT EXISTS desktop_app_release (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  required_version TEXT NOT NULL DEFAULT '1.0.0',
  latest_version TEXT NOT NULL DEFAULT '1.0.0',
  download_path TEXT NOT NULL DEFAULT '/downloads/ILSA-Support-Portable-1.0.0.exe',
  release_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO desktop_app_release (id, required_version, latest_version, download_path)
VALUES (1, '1.0.0', '1.0.0', '/downloads/ILSA-Support-Portable-1.0.0.exe')
ON CONFLICT (id) DO NOTHING;
