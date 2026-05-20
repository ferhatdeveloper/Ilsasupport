# ⚡ ILSA Support - Quick Start Guide

## 🚀 3 Adımda Başla

### ✅ ADIM 1: İlk Admin Kullanıcısını Oluştur

1. **Tarayıcı konsolunu aç** (F12 veya sağ tık → İncele → Console)

2. **Aşağıdaki kodu kopyala-yapıştır ve ENTER'a bas:**

```javascript
fetch(window.location.origin + '/api/make-server-47081311/setup-admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@ilsasupport.com',
    password: 'Admin123456!',
    name: 'Admin'
  })
}).then(r => r.json()).then(data => {
  console.log('✅ BAŞARILI:', data);
  console.log('📧 Email: admin@ilsasupport.com');
  console.log('🔑 Password: Admin123456!');
  console.log('🔄 Sayfayı yenileyin ve giriş yapın!');
})
```

3. **Başarılı mesajını bekle:**
```
✅ BAŞARILI: {message: "Admin created successfully"}
📧 Email: admin@ilsasupport.com
🔑 Password: Admin123456!
🔄 Sayfayı yenileyin ve giriş yapın!
```

---

### ✅ ADIM 2: Admin Girişi Yap

1. **Sayfayı yenile** (F5)

2. **Sağ üstteki "Sign In" butonuna tıkla**

3. **Giriş bilgilerini gir:**
   - Email: `admin@ilsasupport.com`
   - Password: `Admin123456!`

4. **"Sign In" butonuna tıkla**

5. **Giriş başarılı olunca sağ üstte göreceksin:**
   - 👑 Admin (kullanıcı adın)
   - 🟣 Admin Panel butonu
   - 🔴 Sign Out butonu

---

### ✅ ADIM 3: 70+ Markayı Otomatik Ekle

1. **Admin Panel butonuna tıkla** (mor renkte, sağ üstte)

2. **"Categories" sekmesine git** (sol sidebar)

3. **Konsolu aç** (F12 → Console)

4. **`/setup-brands.js` dosyasını aç ve tüm içeriğini kopyala**

5. **Konsola yapıştır ve ENTER'a bas**

6. **Şimdi komutu çalıştır:**

```javascript
setupAllBrands()
```

7. **Token iste-diğinde şunu çalıştır:**

```javascript
// Token'ı al
const token = (await (await fetch(window.location.origin + '/api/make-server-47081311/verify-session', {
  headers: { 'Authorization': 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token }
})).json()).user;
console.log('Token hazır, tekrar setupAllBrands() çalıştır');
```

Sonra tekrar:
```javascript
setupAllBrands()
```

8. **70+ marka eklenirken göreceksin:**
```
🚀 70 marka ekleniyor...
✅ Samsung eklendi
✅ Xiaomi eklendi
✅ Huawei eklendi
...
✨ Tamamlandı!
✅ Başarılı: 70
```

9. **Sayfa otomatik yenilenecek ve tüm markalar görünecek!**

---

## 🎉 Tebrikler! Kurulum Tamamlandı

Şimdi yapabileceklerin:

### 📁 Dosya Yükle
1. Admin Panel → Files sekmesi
2. "Add File" butonuna tıkla
3. Bilgileri doldur:
   - **File Name**: Samsung Galaxy S21 Firmware
   - **Category**: Samsung seç
   - **Type**: Firmware
   - **Version**: 12.0
   - **Size (MB)**: 3500
   - **Google Drive URL**: `https://drive.google.com/file/d/YOUR_FILE_ID/view`
4. "Add File" tıkla

### 📱 Ana Sayfayı Görüntüle
- Sol altta "Back to Home" butonuna tıkla
- 70+ marka kartını göreceksin
- Her karta tıklayarak dosyaları filtreleyebilirsin

### 👥 Normal Kullanıcı Oluştur
1. Sign Out yap
2. "Sign Up" butonuna tıkla
3. Yeni hesap oluştur
4. Free plan (5 downloads/day) ile dene

### 💎 Premium Test
1. Premium butonuna tıkla
2. Demo modda gerçek ödeme gerekmez
3. Upgrade işlemini tamamla
4. Sınırsız indirme yetkisi kazan

---

## 🔧 Sorun Giderme

### ❌ "0 brands available" gösteriliyor
- Henüz kategori eklenmemiş
- Adım 3'ü tekrar yap

### ❌ "Admin Panel" butonu görünmüyor
- Admin olarak giriş yapmadın
- Adım 2'yi kontrol et
- Email/password doğru mu?

### ❌ setupAllBrands() çalışmıyor
- Token doğru mu?
- Admin olarak giriş yaptın mı?
- Konsol hatası var mı?

### ❌ Backend hatası alıyorum
- Supabase bağlantısı aktif mi?
- `/supabase/functions/server/index.tsx` çalışıyor mu?
- Konsol loglarını kontrol et

---

## 📊 Sistem Özellikleri

### ✅ Kullanıcı Sistemi
- Email/Password kayıt & giriş
- Free plan: 5 downloads/day
- Premium plan: Unlimited
- Session yönetimi
- Role-based access

### ✅ Dosya Sistemi
- 70+ marka kategorisi
- Firmware/Tool/Driver tipleri
- Google Drive entegrasyonu
- Tek kullanımlık download links
- Premium dosya desteği

### ✅ Admin Panel
- Dashboard istatistikleri
- Kategori yönetimi (CRUD)
- Dosya yönetimi (CRUD)
- Kullanıcı görüntüleme
- Session monitoring

---

## 📞 Destek

- 📖 Detaylı dokümantasyon: `/README.md`
- 🛠️ Setup rehberi: `/SETUP_GUIDE.md`
- 📝 Brand setup script: `/setup-brands.js`

---

**🇹🇷 ILSA Support - Türkiye'nin SUPPORT'u**

⚡ 70+ Marka • 📱 1000+ Dosya • 🔒 Güvenli İndirme
