# 🔧 ILSA Support - Professional Firmware & Tool Platform

**Türkiye'nin SUPPORT'u** - Modern, profesyonel firmware ve tool indirme platformu.

![ILSA Support](https://img.shields.io/badge/Status-Production%20Ready-success)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan)

## ✨ Özellikler

### 🎨 Modern UI/UX
- ✅ Dark theme tasarım
- ✅ Gradient kartlar ve animasyonlar
- ✅ Responsive (2-3-4-6-8 column grid)
- ✅ Smooth transitions & hover effects
- ✅ Professional color schemes

### 👥 Kullanıcı Sistemi
- ✅ Email/Password kayıt & giriş
- ✅ Session yönetimi (max sessions/user)
- ✅ Free plan (5 downloads/day)
- ✅ Premium plan (unlimited)
- ✅ Role-based access (admin/user)

### 📁 Dosya Yönetimi
- ✅ 70+ marka kategorisi
- ✅ Firmware/Tool/Driver tipleri
- ✅ Google Drive entegrasyonu
- ✅ Tek kullanımlık download links (1 saat)
- ✅ Premium dosya desteği
- ✅ Version tracking
- ✅ Download counter

### 💎 Premium Sistem
- ✅ Monthly ($9.99) & Yearly ($99.99) plans
- ✅ Unlimited downloads
- ✅ High-speed downloads
- ✅ Premium-only files
- ✅ 3 concurrent sessions
- ✅ Priority support

### 🛡️ Admin Panel
- ✅ Dashboard with statistics
- ✅ Category management (CRUD)
- ✅ File upload & management
- ✅ User management
- ✅ Download tracking
- ✅ Session monitoring

### 🔒 Güvenlik
- ✅ Session-based auth
- ✅ One-time download tokens
- ✅ Google Drive link hiding
- ✅ Rate limiting ready
- ✅ XSS protection
- ✅ CORS configured

## 🚀 Hızlı Başlangıç

### 1. İlk Admin Oluştur

Tarayıcı konsolunda (F12):

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

### 2. Admin Girişi

- Sign In → `admin@firmwarehub.com` / `admin123456`

### 3. Markaları Ekle

`/setup-brands.js` dosyasını konsola kopyala-yapıştır:

```javascript
setupAllBrands()
```

70+ marka otomatik eklenecek!

## 📊 Desteklenen Markalar (70+)

### Popüler Markalar
Samsung • Xiaomi • Huawei • iPhone • Oppo • Realme • OnePlus • Nokia • Motorola • LG • Lenovo • Asus • Google Pixel • Nothing • Honor • Vivo • Tecno

### Tüm Markalar (A-Z)
Alcatel, Archos, Asus, BlackBerry, Blackview, BLU, BQ Aquaris, Casper, CAT, Coolpad, Cubot, Doogee, Elephone, General Mobile, Gigaset, Google Pixel, Gplus, Hiking, Hisense, Hometech, Honor, HTC, Huawei, Infinix, iPhone, iQOO, İtel, Kaan, Lava, Lenovo, LG, Masstel, Meizu, Micromax, Motorola, Nokia, Nothing, Nubia, OMX, OnePlus, Oppo, Q Mobile, Realme, Reeder, Samsung, Sky, Symphony, TCL, Technopc, Tecno Mobile, Thomson, Tinmo, Trident, Ulefone, Umidigi, Vestel, Vivo, Vodafone, Walton, Wiko, Xiaomi, ZTE

### Tools & Special Categories
Box Tool Program, Chimera, DFT Pro, EFT Pro, Magisk, MTK Tools, Pandora Tool, Unlock Tool, Tablet Yazılımları, Tuşlu Telefon, Karşık Cihazlar, Videolu Çözümler

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Lucide React** - Icons
- **Supabase Client** - Auth & API

### Backend
- **Hono** - Web framework (Deno)
- **Supabase Auth** - Authentication
- **Supabase KV** - Key-value database
- **Deno** - Runtime

### Infrastructure
- **Supabase** - Backend as a Service
- **Google Drive** - File storage
- **Edge Functions** - Serverless API

## 📁 Proje Yapısı

```
/
├── components/
│   ├── AdminDashboard.tsx      # Admin ana panel
│   ├── AdminStats.tsx          # Dashboard istatistikleri
│   ├── AdminCategories.tsx     # Kategori yönetimi
│   ├── AdminFiles.tsx          # Dosya yönetimi
│   ├── AuthModal.tsx           # Giriş/Kayıt modal
│   ├── CategoryGrid.tsx        # Marka kartları grid
│   ├── FileList.tsx            # Dosya listesi
│   ├── Header.tsx              # Ana header
│   ├── HomePage.tsx            # Ana sayfa
│   └── PremiumModal.tsx        # Premium yükseltme
├── supabase/functions/server/
│   └── index.tsx               # Backend API
├── App.tsx                     # Ana uygulama
├── setup-brands.js             # Marka setup scripti
├── SETUP_GUIDE.md             # Detaylı kurulum
└── README.md                   # Bu dosya
```

## 📖 Kullanım

### Kategori Ekleme (Admin)

```typescript
POST /api/make-server-47081311/categories
{
  "name": "Samsung",
  "slug": "samsung",
  "icon": "📱",
  "description": "Samsung firmware and tools"
}
```

### Dosya Yükleme (Admin)

```typescript
POST /api/make-server-47081311/files
{
  "name": "Galaxy S21 Firmware",
  "categoryId": "uuid",
  "fileType": "firmware",
  "version": "12.0",
  "size": 3500 * 1024 * 1024,
  "downloadUrl": "https://drive.google.com/file/d/...",
  "isPremium": false
}
```

### Dosya İndirme (User)

```typescript
POST /api/make-server-47081311/files/{fileId}/download
// Returns download token

GET /api/make-server-47081311/download/{token}
// Returns actual download URL
```

## 🔐 Güvenlik Özellikleri

### Session Management
- Kullanıcı başına maksimum oturum sayısı
- Free: 1 session, Premium: 3 sessions, Admin: 10 sessions
- 24 saat session timeout
- Otomatik eski session silme

### Download Protection
- Tek kullanımlık tokenlar
- 1 saat expiry
- IP tracking (opsiyonel)
- Rate limiting ready

### Role-Based Access
- **User**: Dosya görüntüleme, limited download
- **Premium**: Unlimited download, premium files
- **Admin**: Full access, management

## 💳 Ödeme Entegrasyonu (Hazır)

Backend premium upgrade endpoint'i hazır:

```typescript
POST /api/make-server-47081311/upgrade-premium
{
  "planType": "monthly" | "yearly"
}
```

**Not:** Demo modda gerçek ödeme gerekmez. iyzico/Stripe entegrasyonu eklenebilir.

## 📈 İstatistikler (Admin)

- Total users
- Premium users
- Total files
- Total categories
- Total downloads
- Active sessions

## 🌍 Çoklu Dil Desteği (Gelecek)

Altyapı hazır, çeviri dosyaları eklenebilir:
- 🇹🇷 Türkçe
- 🇬🇧 English
- 🇸🇦 العربية

## 🎯 Roadmap

- [ ] iyzico/Stripe ödeme entegrasyonu
- [ ] Kullanıcı profil sayfası
- [ ] İndirme geçmişi
- [ ] Favori dosyalar
- [ ] Dosya rating sistemi
- [ ] Comment sistemi
- [ ] Email bildirimleri
- [ ] Download statistics & charts
- [ ] Advanced search & filters
- [ ] Blog/News section
- [ ] Support ticket system
- [ ] API documentation

## ⚠️ Yasal Uyarı

Bu platform **sadece eğitim ve bilgi paylaşım amaçlıdır**.

T.C. Kanunlarına göre **IMEI silme yasaktır**. Platform geliştiricileri kullanıcıların yasa dışı faaliyetlerinden sorumlu değildir.

## 📄 Lisans

Bu proje eğitim amaçlıdır. Ticari kullanım için geliştirici ile iletişime geçin.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

## 📞 İletişim

- **Website**: firmwarehub.com (demo)
- **Support**: support@firmwarehub.com
- **Documentation**: /SETUP_GUIDE.md

---

**Made with ❤️ for the firmware community**

🔥 **70+ Brands** • 📱 **1000+ Files** • ⚡ **Lightning Fast**