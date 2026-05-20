-- Masaüstü portable 1.0.1 indirme yolu (site + API desktop-app-config)
UPDATE desktop_app_release
SET
  latest_version = '1.0.1',
  download_path = '/downloads/ILSA-Support-Portable-1.0.1.exe',
  updated_at = NOW()
WHERE id = 1;

-- Zorunlu minimum sürüm 1.0.0 kalır (eski portable kullanıcıları engellenmez)
