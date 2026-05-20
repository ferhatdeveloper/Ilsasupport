ILSA SUPPORT — SQL kurulum sırası
================================

--- YEREL POSTGRESQL (Supabase yok, Hono/Deno API) ---
Aşağıdaki sırayla psql veya pgAdmin Query Tool ile çalıştırın:

  1. sql/00_plain_postgres_prereqs.sql
  2. sql/01_app_database_setup_standalone.sql
  3. sql/02_schema_legacy_ilsa_standalone.sql
  4. sql/03_pg_runtime_tables.sql
  5. sql/04_rpc_and_helpers.sql
  6. sql/09_cms_content.sql              — cms_hero_slides, cms_info_pages (admin slayt / bilgi sayfaları)
  (İsteğe bağlı) sql/08_normalize_bilgi_drive_usercontent.sql — mevcut veride Drive linklerini usercontent biçimine çevirir
  (RLS'li eski kurulum) sql/12_kategoriler_rls_api_mutations.sql — kategoriler admin INSERT/UPDATE/DELETE politikaları (bir kez)

Not: `npm run db:schema` yukarıdaki 1–6 dosyalarını sırayla uygular (.env.local → DATABASE_URL).

Örnek (PowerShell, proje kökünde, .env.local içindeki DATABASE_URL kullanımı):
  $u = ((Get-Content .env.local) | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=',''
  psql $u -f sql/00_plain_postgres_prereqs.sql
  psql $u -f sql/01_app_database_setup_standalone.sql
  ... (aynı $u ile devam)

Not: 99_all_in_one.sql ve 01/02 orijinal dosyalar auth.uid() + storage içerir; düz PostgreSQL için standalone dosyaları kullanın.

--- ESKİ MySQL DÖKÜMÜ (ilsasup_ilsasupp_ort.sql) ---
`Ilsasupport-php/ilsasup_ilsasupp_ort.sql` MySQL/MariaDB (phpMyAdmin) formatındadır; `psql` ile doğrudan çalışmaz
(`CREATE TABLE` backtick, ENGINE=MyISAM, `auth` yok). Veri ~2,47M satırdır; sadece uygulamanın kullandığı
`bilgi` + `kategoriler` tabloları, PG şemasına dönüştürülerek alınır (MySQL `kategoriler` sütunları `kategori_adi` / `ust_kategori_id` ile aynı değildir).

  npm run import:ort   (önce: npm run db:schema, .env.local’de DATABASE_URL)

Dump yolu: ORT_SQL_PATH=c:\yol\dump.sql ile override edilebilir (varsayılan: Ilsasupport-php/ilsasup_ilsasupp_ort.sql).
Mevcut `indirme_gecmisi` ve hedef tablolar TRUNCATE edilir; production’da dikkat.

API sunucusu (Hono/Deno): proje kökünde .env.local (DATABASE_URL, JWT_SECRET) ile
  npm run api
Deno kurulu olmalı: https://docs.deno.com/runtime/getting_started/installation

--- SUPABASE SQL Editor ---
Supabase Dashboard > SQL Editor içinde dosyaları AŞAĞIDAKİ SIRAYLA çalıştırın
(tek seferde yapıştırmak isterseniz: 99_all_in_one.sql dosyasını güncelleyip kullanın).

1. 01_app_database_setup.sql   — users, sessions, electron_tokens, brands, categories, files, download_links, RLS, trigger’lar
2. 02_schema_legacy_ilsa.sql    — kategoriler, bilgi, indirme_gecmisi (PHP dump ile uyum: bilgi.katid/altkat TEXT)
3. 03_pg_runtime_tables.sql     — Ayrı tablolar: demo katalog, indirme token’ları, destek, WebRTC, session_token_lookup (KV tablosu YOK)
4. 04_rpc_and_helpers.sql       — increment, increment_file_hit, increment_file_down
5. 05_storage_json_files.sql     — json-files bucket (opsiyonel)
6. 06_auth_users_fk.sql         — (İsteğe bağlı) public.users ↔ auth.users
7. 07_bilgi_katid_text_upgrade.sql — (Yalnızca eski INTEGER kurulumu varsa) bilgi.katid / altkat → TEXT
8. 08_normalize_bilgi_drive_usercontent.sql — (İsteğe bağlı) bilgi.link / link2 / link3 içindeki Drive URL’lerini ve düz dosya id’lerini `drive.usercontent.google.com/download?...&authuser=0` biçimine toplu çevirir
9. 09_cms_content.sql — Ana sayfa slaytları + bilgi sayfaları tabloları (admin “İçerik” sekmesi)

Not: Edge tarafında kv_store.tsx API’si korunur; veri yukarıdaki ilişkisel tablolara yazılır.
