-- bilgi tablosunu boşaltıp id sırasını sıfırlar; bilgi'ye bağlı indirme_gecmisi satırları CASCADE ile silinir.
-- Uygulama içinden: POST /make-server-47081311/reload-bilgi-from-json (admin token)
-- Manuel sonrası: JSON migrasyon veya API ile bilgi.json INSERT

TRUNCATE bilgi RESTART IDENTITY CASCADE;
