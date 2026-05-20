# 🚀 PostgreSQL Migration Guide

JSON dosyalarından PostgreSQL tablolarına geçiş rehberi.

---

## 📋 ADIM 1: Supabase'de Tabloları Oluştur

### 1. Supabase Dashboard'a git
```
https://supabase.com/dashboard/project/rleiiezkvhrzmbccqock
```

### 2. SQL Editor'ü aç
- Sol menüden **SQL Editor** sekmesine tıkla
- **New query** butonuna tıkla

### 3. Kategoriler Tablosunu Oluştur

```sql
-- Kategoriler tablosu (hiyerarşik yapı)
CREATE TABLE IF NOT EXISTS kategoriler (
  id SERIAL PRIMARY KEY,
  kategori_adi VARCHAR(255) NOT NULL,
  ust_kategori_id INTEGER REFERENCES kategoriler(id) ON DELETE SET NULL,
  aciklama TEXT,
  resim TEXT,
  sira INTEGER DEFAULT 0,
  durum VARCHAR(50) DEFAULT 'active',
  eklenme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- İndeksler
  CONSTRAINT idx_kategoriler_durum CHECK (durum IN ('active', 'inactive', 'deleted'))
);

-- İndeksler oluştur
CREATE INDEX IF NOT EXISTS idx_kategoriler_ust_kategori ON kategoriler(ust_kategori_id);
CREATE INDEX IF NOT EXISTS idx_kategoriler_durum ON kategoriler(durum);
CREATE INDEX IF NOT EXISTS idx_kategoriler_kategori_adi ON kategoriler(kategori_adi);

-- Açıklama
COMMENT ON TABLE kategoriler IS 'Hiyerarşik kategori yapısı: Markalar ve alt kategoriler';
COMMENT ON COLUMN kategoriler.ust_kategori_id IS 'NULL ise ana marka (SAMSUNG, XIAOMI), değer varsa alt kategori';
```

**RUN** butonuna tıkla ve sonucu kontrol et! ✅

---

### 4. Bilgi Tablosunu Oluştur

```sql
-- Bilgi tablosu (dosya bilgileri)
CREATE TABLE IF NOT EXISTS bilgi (
  id SERIAL PRIMARY KEY,
  katid INTEGER REFERENCES kategoriler(id) ON DELETE SET NULL,
  altkat INTEGER REFERENCES kategoriler(id) ON DELETE SET NULL,
  adi VARCHAR(255) NOT NULL,
  boyut VARCHAR(255),
  link TEXT,
  link2 TEXT,
  link3 TEXT,
  tarih TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hit INTEGER DEFAULT 0,
  down INTEGER DEFAULT 0,
  asama VARCHAR(50),
  bildiri VARCHAR(255),
  renkodu VARCHAR(255) DEFAULT '#008000'
);

-- İndeksler oluştur
CREATE INDEX IF NOT EXISTS idx_bilgi_katid ON bilgi(katid);
CREATE INDEX IF NOT EXISTS idx_bilgi_altkat ON bilgi(altkat);
CREATE INDEX IF NOT EXISTS idx_bilgi_tarih ON bilgi(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_bilgi_adi ON bilgi(adi);
CREATE INDEX IF NOT EXISTS idx_bilgi_katid_altkat ON bilgi(katid, altkat);

-- Açıklama
COMMENT ON TABLE bilgi IS 'Dosya bilgileri ve indirme linkleri';
COMMENT ON COLUMN bilgi.katid IS 'Ana kategori (marka) ID - kategoriler.id referansı';
COMMENT ON COLUMN bilgi.altkat IS 'Alt kategori (model) ID - kategoriler.id referansı';
COMMENT ON COLUMN bilgi.asama IS 'Boş ise free, dolu ise premium dosya';
```

**RUN** butonuna tıkla ve sonucu kontrol et! ✅

---

### 5. Yardımcı Fonksiyonlar Oluştur (Opsiyonel)

```sql
-- Hit (görüntülenme) sayısını artır
CREATE OR REPLACE FUNCTION increment_file_hit(file_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE bilgi SET hit = hit + 1 WHERE id = file_id;
END;
$$ LANGUAGE plpgsql;

-- Down (indirme) sayısını artır
CREATE OR REPLACE FUNCTION increment_file_down(file_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE bilgi SET down = down + 1 WHERE id = file_id;
END;
$$ LANGUAGE plpgsql;
```

**RUN** butonuna tıkla! ✅

---

## 📋 ADIM 2: JSON Dosyalarını Storage'a Yükle

### 1. Storage'a git
- Sol menüden **Storage** sekmesine tıkla
- **json-files** bucket'ı aç (yoksa oluştur)

### 2. Bucket Oluştur (Eğer yoksa)
```
Bucket name: json-files
Public: ❌ (Private)
```

### 3. JSON Dosyalarını Yükle
- **Upload File** butonuna tıkla
- `kategoriler.json` dosyasını seç ve yükle
- `bilgi.json` dosyasını seç ve yükle

---

## 📋 ADIM 3: Backend'i Deploy Et

### 1. Supabase Edge Functions'a git
```
https://supabase.com/dashboard/project/rleiiezkvhrzmbccqock/functions
```

### 2. make-server-47081311 fonksiyonunu deploy et
- **Deploy** butonuna tıkla
- Değişikliklerin yüklenmesini bekle

### 3. Logs'u kontrol et
- **Logs** sekmesine tıkla
- Hataları kontrol et

---

## 📋 ADIM 4: Migration Çalıştır

### 1. Admin olarak giriş yap
Web uygulamasına git:
```
https://ilsasupport.figma.site/
```

Admin kullanıcısı ile giriş yap.

### 2. Browser Console'u aç
- **F12** tuşuna bas (veya sağ tık → İncele)
- **Console** sekmesini seç

### 3. Migration Scriptini Çalıştır

```javascript
// 1. Access token al
const session = await (await fetch('https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/verify-session', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZWlpZXprdmhyem1iY2Nxb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMxNDg5MjEsImV4cCI6MjA0ODcyNDkyMX0.9rG9Bd7LmYk5GgDmwO1NmTB-2zz8OZ8_Ga-lNF0PK3Q'
  }
})).json();

const accessToken = session.accessToken;

// 2. Migration'ı başlat
const migrateResponse = await fetch('https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/migrate-json-to-postgresql', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await migrateResponse.json();
console.log('📊 Migration Sonucu:', result);
```

### 4. Sonucu Kontrol Et

Console'da şöyle bir çıktı göreceksin:
```
╔════════════════════════════════════════╗
║   JSON → PostgreSQL MIGRATION          ║
║   ILSA Support Platform                ║
╚════════════════════════════════════════╝

📦 KATEGORİLER MIGRATION BAŞLIYOR...
✅ Batch 1: 500 kayıt eklendi (Toplam: 500)
✅ Batch 2: 500 kayıt eklendi (Toplam: 1000)
...

📊 KATEGORİLER SONUÇ:
   ✅ Başarılı: 3500
   ❌ Hatalı: 0

📦 BİLGİ (DOSYALAR) MIGRATION BAŞLIYOR...
✅ Batch 1: 500 kayıt eklendi (Toplam: 500)
...

╔════════════════════════════════════════╗
║   ✅ MIGRATION TAMAMLANDI!            ║
║   ⏱️  Süre: 12.45 saniye              ║
╚════════════════════════════════════════╝
```

---

## 📋 ADIM 5: Veriyi Kontrol Et

### 1. SQL Editor'de Kontrol Et

```sql
-- Toplam marka sayısı (ust_kategori_id IS NULL)
SELECT COUNT(*) as total_brands 
FROM kategoriler 
WHERE ust_kategori_id IS NULL 
  AND durum = 'active';

-- Örnek markalar
SELECT id, kategori_adi, ust_kategori_id 
FROM kategoriler 
WHERE ust_kategori_id IS NULL 
  AND durum = 'active'
ORDER BY kategori_adi 
LIMIT 10;

-- Toplam dosya sayısı
SELECT COUNT(*) as total_files FROM bilgi;

-- Örnek dosyalar
SELECT id, adi, katid, altkat, boyut 
FROM bilgi 
ORDER BY id DESC 
LIMIT 10;

-- Premium dosya sayısı (asama dolu olanlar)
SELECT COUNT(*) as premium_files 
FROM bilgi 
WHERE asama IS NOT NULL AND asama != '';

-- Free dosya sayısı (asama boş olanlar)
SELECT COUNT(*) as free_files 
FROM bilgi 
WHERE asama IS NULL OR asama = '';
```

---

## 📋 ADIM 6: Frontend'i Test Et

### 1. Sayfayı Yenile
```
https://ilsasupport.figma.site/
```

### 2. Console Loglarını Kontrol Et

Şu logları göreceksin:
```
🏢 Markalar yükleniyor...
🏢 Fetching brands from PostgreSQL...
✅ Brands fetched: 12
📡 Brands response status: 200
✅ Brands data: {...}
📊 Toplam marka sayısı: 12
```

### 3. Markaları Göreceksin!
- Ana sayfada markalar görünmeli
- Markaya tıklayınca kategoriler gelmeli
- Kategoriye tıklayınca dosyalar gelmeli

---

## ✅ BAŞARI KRİTERLERİ

- ✅ **Kategoriler tablosu** oluşturuldu
- ✅ **Bilgi tablosu** oluşturuldu
- ✅ **JSON dosyaları** Storage'a yüklendi
- ✅ **Migration** başarıyla tamamlandı
- ✅ **Markalar** web'de görünüyor
- ✅ **Kategoriler** çalışıyor
- ✅ **Dosyalar** listeleniyor

---

## ⚠️ SORUN GİDERME

### Hata: "relation 'kategoriler' does not exist"
```sql
-- Tabloyu tekrar oluştur
CREATE TABLE kategoriler (...);
```

### Hata: "bucket 'json-files' not found"
```
Storage → Create bucket → json-files (Private)
```

### Migration hiç çalışmıyor
- Admin olarak giriş yaptığınızdan emin olun
- Console'da hata mesajlarını kontrol edin
- Backend logs'ları kontrol edin

### Markalar görünmüyor
```javascript
// Console'da test et:
fetch('https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/brands', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZWlpZXprdmhyem1iY2Nxb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMxNDg5MjEsImV4cCI6MjA0ODcyNDkyMX0.9rG9Bd7LmYk5GgDmwO1NmTB-2zz8OZ8_Ga-lNF0PK3Q'
  }
})
  .then(r => r.json())
  .then(console.log);
```

---

## 📊 VERİ YAPISI ÖRNEKLER

### Ana Markalar (ust_kategori_id IS NULL)
```
id: 1,    kategori_adi: 'SAMSUNG',  ust_kategori_id: NULL
id: 2716, kategori_adi: 'XIAOMI',   ust_kategori_id: NULL
id: 3802, kategori_adi: 'TECNO',    ust_kategori_id: NULL
```

### Alt Kategoriler (ust_kategori_id = 1)
```
id: 2, kategori_adi: 'A310F', ust_kategori_id: 1
id: 7, kategori_adi: 'A320F', ust_kategori_id: 1
```

### Dosyalar
```
id: 53839, katid: 1, altkat: 6562, adi: 'A042F U13 REPAIR'
   katid: 1 → SAMSUNG
   altkat: 6562 → A042F modeli
```

---

## 🎉 TAMAMLANDI!

Sistem artık PostgreSQL kullanıyor! 🚀

**Avantajlar:**
- ✅ Çok daha hızlı sorgular
- ✅ İndeksli arama
- ✅ İlişkisel sorgular (JOIN)
- ✅ Daha profesyonel yapı
- ✅ Kolay backup/restore

**Sonraki Adımlar:**
- JSON dosyalarını silebilirsin (artık gerekmiyor)
- Storage bucket'ı temizleyebilirsin
- Migration scripti kodunu kaldırabilirsin
