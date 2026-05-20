# ⚡ ILSA Support Electron - Hızlı Başlangıç

## 5 Dakikada Başla!

### 1️⃣ Kurulum
```bash
cd electron-app
npm install
```

### 2️⃣ Çalıştır
```bash
npm start
```

### 3️⃣ Giriş Yap
```
Email: admin@ilsasupport.com
Şifre: Admin123456!
```

✅ **HAZIR!** Browser otomatik açılacak.

---

## 🛠️ Uzaktan Destek Nasıl Kullanılır?

### Kullanıcı Tarafı (Destek Alanlar)

1. **Electron uygulamasını aç**
2. **"Uzaktan Destek Talebi" butonuna tıkla**
3. **Destek ID'yi kopyala** (örn: `ILSA-A1B2C3D4`)
4. **Bu ID'yi destek ekibine ilet:**
   - WhatsApp
   - Email
   - Telefon
5. **Destek ekibi bağlantı talebi gönderdiğinde onay ver**
6. **Bağlantı kurulur ve destek başlar**

### Destek Ekibi Tarafı (Destek Verenler)

#### Yöntem 1: API ile (Önerilen)

```bash
# 1. Destek talebi gönder
curl -X POST https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/request-support \
  -H "Content-Type: application/json" \
  -d '{
    "supportId": "ILSA-A1B2C3D4",
    "supporterName": "Ahmet Yılmaz"
  }'

# Cevap:
{
  "success": true,
  "requestId": "abc-123-def-456",
  "message": "Destek talebi gönderildi, kullanıcı onayı bekleniyor"
}
```

```bash
# 2. Kullanıcı onayını kontrol et (polling)
curl https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/check-support-request?supportId=ILSA-A1B2C3D4

# Onaylanırsa:
{
  "success": true,
  "hasRequest": true,
  "request": {
    "status": "approved",
    "sessionId": "xyz-789"
  }
}
```

```bash
# 3. Session'ı kontrol et
curl https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/check-support-session?sessionId=xyz-789

# Aktifse:
{
  "success": true,
  "active": true,
  "session": {
    "sessionId": "xyz-789",
    "status": "active"
  }
}
```

#### Yöntem 2: Web Panel (Gelecekte)

Destek ekibi için özel bir web paneli:
- Aktif destek taleplerini göster
- Tek tıkla bağlan
- Session yönetimi
- Geçmiş kayıtları görüntüle

---

## 🎯 Build Al

### Windows
```bash
npm run build:win
```
Çıktı: `dist/ILSA Support Setup.exe`

### Mac
```bash
npm run build:mac
```
Çıktı: `dist/ILSA Support.dmg`

### Linux
```bash
npm run build:linux
```
Çıktı: `dist/ILSA Support.AppImage`

---

## 🔧 Yapılandırma

### Backend URL Değiştir

`src/main.js` dosyasını aç:

```javascript
// Kendi backend URL'nizi girin
const BACKEND_URL = 'https://YOUR-PROJECT.supabase.co';
const WEB_URL = 'https://YOUR-SITE.com';
```

### Icon Ekle

`assets/` klasörüne:
- `icon.ico` (Windows)
- `icon.icns` (Mac)
- `icon.png` (Linux + Tray)

Icon boyutu: 512x512 px (PNG), 256x256 px (ICO)

---

## 📊 Sistem Akışı

### Giriş Akışı
```
1. Kullanıcı email/şifre girer
2. Hardware ID otomatik alınır
3. Backend'e gönderilir
4. Backend doğrular + 24h token oluşturur
5. Token ile browser açılır
6. Web app token'ı doğrular
7. Otomatik giriş yapılır
```

### Destek Akışı
```
1. Kullanıcı destek ID alır (ILSA-A1B2C3D4)
2. Destek ekibine iletir
3. Destek ekibi API'ye talep gönderir
4. Kullanıcıya onay dialogu gelir
5. Kullanıcı onaylar
6. Session oluşturulur
7. Uzaktan erişim başlar
```

---

## 🧪 Test Senaryoları

### ✅ Senaryo 1: İlk Giriş
```
1. Uygulamayı aç
2. admin@ilsasupport.com / Admin123456!
3. Giriş yap
4. Browser açılır
5. Dashboard görüntülenir
```

### ✅ Senaryo 2: Uzaktan Destek
```
1. Uygulamayı aç
2. Giriş yap
3. "Uzaktan Destek" butonuna tıkla
4. Destek ID'yi kopyala: ILSA-12345678
5. API'ye test talebi gönder
6. Onay dialogu gelir
7. "İzin Ver" tıkla
8. Bağlantı aktif
```

### ✅ Senaryo 3: Sistem Tepsisi
```
1. Uygulamayı aç
2. Pencereyi kapat (X)
3. Sistem tepsisinde çalışmaya devam eder
4. Tray icon'a sağ tıkla
5. "Ana Pencere" seç
6. Pencere açılır
```

---

## 🐛 Hızlı Sorun Çözme

### Hata: "Hardware ID alınamadı"
```bash
npm uninstall node-machine-id
npm install node-machine-id@1.1.12
```

### Hata: "Backend'e bağlanılamıyor"
- `src/main.js` içinde URL'leri kontrol et
- Internet bağlantısını kontrol et
- Backend'in çalıştığından emin ol

### Hata: "Build başarısız"
```bash
npm install -g electron-builder
npm cache clean --force
rm -rf node_modules
npm install
npm run build
```

### DevTools Aç (Debug için)
```bash
npm start -- --dev
```

---

## 📚 Kaynaklar

- **Tam README**: `/electron-app/README.md`
- **Demo Hesaplar**: `/QUICK_DEMO_SETUP.md`
- **Backend API**: `/supabase/functions/server/index.tsx`
- **Genel Bakış**: `/START_HERE.md`

---

## 🎉 Tamamdır!

Artık ILSA Support Electron uygulaması hazır!

**İletişim:**
- GitHub Issues
- Email: support@ilsasupport.com
- WhatsApp: [Numaranız]

**Versiyon:** 2.0.0  
**Son Güncelleme:** 2025-12-31
