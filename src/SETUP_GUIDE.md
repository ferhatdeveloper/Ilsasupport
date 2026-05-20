# ILSA Support - Setup Guide

**Türkiye'nin SUPPORT'u** 🇹🇷

## 🚀 Quick Start (3 Adım)

### Adım 1: İlk Admin Oluştur

Tarayıcı konsolunu aç (F12) ve çalıştır:

```javascript
fetch(window.location.origin + '/api/make-server-47081311/setup-admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@firmwarehub.com',
    password: 'admin123456',
    name: 'Admin'
  })
}).then(r => r.json()).then(console.log)
```

### Adım 2: Admin Girişi Yap

1. Sayfayı yenile
2. "Sign In" butonuna tıkla
3. Email: `admin@firmwarehub.com`
4. Password: `admin123456`
5. Giriş yap

### Adım 3: Tüm Markaları Otomatik Ekle

Konsola `/setup-brands.js` dosyasının içeriğini kopyala-yapıştır, sonra:

```javascript
setupAllBrands()
```

Bu komut **70+ markayı** otomatik ekleyecek:
- Samsung, Xiaomi, Huawei, iPhone
- Oppo, Realme, OnePlus, Nokia
- Motorola, LG, Lenovo, Asus
- Ve 60+ marka daha!

**Not:** Token istediğinde admin olarak giriş yaptıktan sonra şunu çalıştır:
```javascript
(await supabase.auth.getSession()).data.session.access_token
```

---

## 📦 Manuel Kategori Ekleme (Opsiyonel)

Admin panelde "Categories" sekmesinden manuel ekleyebilirsin:

### Popüler Markalar
- **Samsung** - 📱 samsung
- **Xiaomi** - 🟧 xiaomi  
- **Huawei** - 🔴 huawei
- **iPhone** - 🍎 iphone
- **Oppo** - 🟢 oppo
- **Realme** - 🟡 realme
- **OnePlus** - 🔴 oneplus
- **Nokia** - 🔵 nokia

### Tool Kategorileri
- **MTK Tools** - 🔧 mtk-tools
- **Unlock Tool** - 🔓 unlock-tool
- **Box Tool Program** - 📦 box-tool
- **Pandora Tool** - 🔧 pandora-tool

---

## 📁 Dosya Yükleme

1. Admin panelde "Files" sekmesine git
2. "Add File" butonuna tıkla
3. Bilgileri doldur:
   - **File Name**: Samsung Galaxy S21 Firmware
   - **Category**: Samsung seç
   - **Type**: Firmware / Tool / Driver
   - **Version**: 12.0
   - **Size (MB)**: 3500
   - **Google Drive URL**: `https://drive.google.com/file/d/YOUR_FILE_ID/view`
   - **Premium Only**: İsteğe göre işaretle

4. "Add File" tıkla

### Google Drive Link Formatı

✅ Doğru format:
- `https://drive.google.com/file/d/ABC123xyz/view`
- `https://drive.google.com/open?id=ABC123xyz`

❌ Yanlış format:
- Shared folder linkleri
- View only linkleri

---

## 📋 Features Overview

### 🎨 Marka Kartları
- 70+ marka desteği
- Renkli gradient kartlar
- Hover animasyonları
- Dosya sayısı gösterimi
- Responsive grid (2-3-4-6-8 columns)

### User Features
- ✅ Marka bazlı filtreleme
- ✅ Dosya arama
- ✅ Sınırlı indirme (Free: 5/gün)
- ✅ Premium yükseltme

### Premium Features
- ✅ Sınırsız indirme
- ✅ Hızlı indirme
- ✅ Premium dosyalar
- ✅ 3 cihaz desteği

### Admin Features
- ✅ Dashboard istatistikleri
- ✅ 70+ kategori yönetimi
- ✅ Dosya yönetimi
- ✅ İndirme takibi

---

## 🔐 Güvenlik

- Session yönetimi (max oturum/kullanıcı)
- Tek kullanımlık download token (1 saat)
- Google Drive link gizleme
- Role-based access (admin/user/premium)

---

## 💎 Premium Plans

- **Monthly**: $9.99/month
- **Yearly**: $99.99/year (Save $20)

Demo modda gerçek ödeme gerekmez.

---

## 📊 Desteklenen Markalar (70+)

### Phones (A-Z)
Alcatel, Archos, Asus, BlackBerry, Blackview, BLU, BQ Aquaris, Casper, CAT, Coolpad, Cubot, Doogee, Elephone, General Mobile, Gigaset, Google Pixel, Gplus, Hiking, Hisense, Hometech, Honor, HTC, Huawei, Infinix, iPhone, iQOO, İtel, Kaan, Lava, Lenovo, LG, Masstel, Meizu, Micromax, Motorola, Nokia, Nothing, Nubia, OMX, OnePlus, Oppo, Q Mobile, Realme, Reeder, Samsung, Sky, Symphony, TCL, Technopc, Tecno Mobile, Thomson, Tinmo, Trident, Ulefone, Umidigi, Vestel, Vivo, Vodafone, Walton, Wiko, Xiaomi, ZTE

### Tools & Special
Box Tool Program, Chimera, DFT Pro, EFT Pro, Magisk, MTK Tools, Pandora Tool, Unlock Tool, Tablet Yazılımları, Tuşlu Telefon, Karşık Cihazlar, Videolu Çözümler

---

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Hono (Deno) + Supabase
- **Database**: Supabase KV Store
- **Storage**: Google Drive
- **Auth**: Supabase Auth

---

**⚠️ Important**: Bu platform eğitim amaçlıdır. T.C. Kanunlarına göre IMEI silme yasaktır.