# 🚀 Demo Data Setup - ILSA Support

## 📋 Kurulum Adımları

### 1️⃣ Admin Kullanıcısı Oluştur

**Endpoint:** `POST /make-server-47081311/setup-admin`

```bash
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/setup-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ilsasupport.com",
    "password": "Admin123456!",
    "name": "ILSA Admin",
    "force": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Admin başarıyla oluşturuldu",
  "user": {
    "id": "uuid...",
    "email": "admin@ilsasupport.com",
    "name": "ILSA Admin"
  }
}
```

---

### 2️⃣ Admin Olarak Giriş Yap

**Web'de:**
1. https://markup-cart-82234705.figma.site/ aç
2. "Giriş Yap" tıkla
3. Email: `admin@ilsasupport.com`
4. Şifre: `Admin123456!`
5. "Admin Paneli" butonu görünür

**Electron App'te:**
```
Email: admin@ilsasupport.com
Şifre: Admin123456!
```

---

### 3️⃣ Kategorileri Oluştur (Markalar)

**Endpoint:** `POST /make-server-47081311/categories`

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

#### Samsung
```bash
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Samsung",
    "slug": "samsung",
    "icon": "📱",
    "description": "Samsung firmware, tools ve flash dosyaları"
  }'
```

#### Xiaomi
```bash
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Xiaomi",
    "slug": "xiaomi",
    "icon": "🔶",
    "description": "Xiaomi MIUI ROM, Fastboot ROM ve Mi Unlock"
  }'
```

#### Huawei
```bash
{
  "name": "Huawei",
  "slug": "huawei",
  "icon": "🔴",
  "description": "Huawei firmware ve FRP unlock tools"
}
```

#### Oppo
```bash
{
  "name": "Oppo",
  "slug": "oppo",
  "icon": "🟢",
  "description": "Oppo ColorOS ROM ve flash tools"
}
```

#### Vivo
```bash
{
  "name": "Vivo",
  "slug": "vivo",
  "icon": "🔵",
  "description": "Vivo stock ROM ve Qualcomm tools"
}
```

#### iPhone
```bash
{
  "name": "iPhone",
  "slug": "iphone",
  "icon": "🍎",
  "description": "iPhone IPSW files, iTunes ve 3uTools"
}
```

---

### 4️⃣ Otomatik Demo Data Oluştur

**Endpoint:** `POST /make-server-47081311/setup-demo-data`

Bu endpoint otomatik olarak:
- Alt kategorileri (subcategories) oluşturur
- Örnek dosyaları (files) oluşturur
- İlişkileri kurar

```bash
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/setup-demo-data \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "35 alt kategori ve 12 dosya oluşturuldu",
  "stats": {
    "subcategories": 35,
    "files": 12
  }
}
```

---

## 📁 Oluşturulacak Veri Yapısı

### Samsung (Marka)
```
├── 🔧 Repair
│   ├── Samsung Galaxy S23 Ultra SM-S918B Repair Firmware
│   └── Samsung Galaxy A54 5G SM-A546B Flash File
├── 🔓 FRP Tools
│   └── Samsung FRP Tool 2024 Latest
├── ⚡ Flash Files
├── 🔄 Combination
└── 💾 Yazılım
```

### Xiaomi (Marka)
```
├── 📱 MIUI ROM
│   ├── Xiaomi 13 Pro MIUI 14 Recovery ROM
│   └── Redmi Note 12 Pro MIUI 14
├── ⚡ Fastboot ROM
├── 🔓 Mi Unlock
└── 🔧 EDL Tools
```

### Huawei (Marka)
```
├── 💾 Firmware
├── 🔓 FRP Remove
└── ⚡ Flash Tool
```

### Oppo (Marka)
```
├── 🎨 ColorOS ROM
│   └── Oppo Reno 10 Pro ColorOS 14
├── ⚡ Flash Tool
└── 🔧 MSM Tool
```

### Vivo (Marka)
```
├── 📱 Stock ROM
├── 🔧 Qualcomm Tool
└── 🔓 FRP Bypass
```

### iPhone (Marka)
```
├── 🍎 IPSW Files
│   └── iPhone 15 Pro Max iOS 17.2 IPSW
├── 🎵 iTunes
└── 🔧 3uTools
```

---

## 🔍 Örnek Dosya Özellikleri

### Free Dosya Örneği:
```json
{
  "name": "Samsung Galaxy A54 5G SM-A546B Flash File",
  "description": "Stock ROM for Samsung Galaxy A54 5G. All regions supported.",
  "version": "13.0",
  "size": 6442450944,
  "fileType": "firmware",
  "isPremium": false,  // ← Free users görebilir
  "downloadUrl": "https://drive.google.com/file/d/ABC123.../view"
}
```

### Premium Dosya Örneği:
```json
{
  "name": "Samsung Galaxy S23 Ultra SM-S918B Repair Firmware",
  "description": "Latest official repair firmware for Galaxy S23 Ultra.",
  "version": "14.0",
  "size": 8589934592,
  "fileType": "firmware",
  "isPremium": true,  // ← Sadece premium users görebilir
  "downloadUrl": "https://drive.google.com/file/d/DEF456.../view"
}
```

---

## 🎯 Role-Based Access

### Free User:
```
✅ Görebilir: isPremium=false dosyalar
❌ Göremez: isPremium=true dosyalar
📊 Limit: 5 indirme/gün
```

### Premium User:
```
✅ Görebilir: TÜM dosyalar
✅ Göremez: -
📊 Limit: Sınırsız indirme
```

### Admin:
```
✅ Görebilir: TÜM dosyalar
✅ Ekleyebilir: Yeni dosyalar, kategoriler
✅ Silebilir: Her şey
📊 Limit: Sınırsız
```

---

## 🔄 Mevcut Verileri Temizleme

Eğer tekrar baştan kurmak isterseniz:

### Admin Panel'den:
1. Admin Dashboard aç
2. "Tüm Session'ları Temizle" (opsiyonel)
3. Manuel olarak kategorileri/dosyaları silin

### Backend'den:
```bash
# KV store'da manuel temizlik (Supabase console'dan)
# Veya yeni admin oluştururken force=true kullan
```

---

## 📊 İstatistikler

Demo data kurulumu sonrası:
```
✅ 6 Marka (Kategori)
✅ 20+ Alt Kategori (Model/Dosya Türü)
✅ 12+ Örnek Dosya
✅ Free/Premium karışık
✅ Google Drive linkli
```

---

## 🎉 Test Senaryoları

### Test 1: Free User
```
1. Kayıt ol → free@ilsasupport.com
2. Kategorileri gez
3. Sadece free dosyaları gör
4. 1 dosya indir
5. Günlük limit: 5
```

### Test 2: Premium User
```
1. Premium üyeliğe geç
2. TÜM dosyaları gör
3. Premium dosyaları indir
4. Sınırsız indirme
```

### Test 3: Admin
```
1. Admin giriş yap
2. Yeni kategori ekle
3. Yeni dosya ekle
4. İstatistikleri gör
5. Session'ları yönet
```

---

## 🚀 Hızlı Setup (Tek Komut)

```bash
# 1. Admin oluştur
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ilsasupport.com","password":"Admin123456!","name":"ILSA Admin","force":true}'

# 2. Giriş yap ve token al (web'de yapılacak)

# 3. Demo data oluştur
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/setup-demo-data \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Süre:** ~30 saniye

---

## 📝 Notlar

- Google Drive linkler demo linklerdir, gerçek dosya yok
- İndirme işlemi Google Drive'a redirect eder
- Tek kullanımlık download tokenlar 5 dakika geçerli
- Session'lar otomatik yönetilir

---

**🎊 Demo data hazır! Test edebilirsiniz!** 🚀
