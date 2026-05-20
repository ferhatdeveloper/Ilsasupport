# ⚡ WebRTC P2P - 5 Dakikada Başlat

## 🎯 Hızlı Test (2 Dakika)

### 1️⃣ Electron Uygulamasını Başlat

```bash
cd electron-app
npm install    # İlk kez için (robotjs, wrtc, node-fetch yükler)
npm start
```

### 2️⃣ Giriş Yap

```
Email: admin@ilsasupport.com
Şifre: Admin123456!
```

### 3️⃣ Destek Penceresini Aç

Electron uygulamasında **"Destek"** butonuna tıkla.

**Support ID'yi kopyala** (örn: `SUPP-ABC123`)

### 4️⃣ Web Sitesinde Bağlan

1. https://ilsasupport.figma.site adresine git
2. Admin olarak giriş yap
3. **Admin Panel** → **Remote Support** sekmesi
4. Support ID'yi yapıştır
5. **"Bağlan"** tıkla

### 5️⃣ İzin Ver

Electron'da dialog açılır:
- **"İzin Ver"** tıkla

### 6️⃣ Bağlantı Kuruldu! 🎉

```
✅ P2P bağlantı aktif
✅ Ekran görüntüleniyor
✅ Mouse/klavye kontrolü hazır
```

---

## 🔧 Dependencies

Electron app için yeni paketler:

```json
{
  "robotjs": "^0.6.0",      // ✅ Mouse/keyboard kontrolü
  "wrtc": "^0.4.7",         // ✅ Node.js WebRTC
  "node-fetch": "^2.6.7"    // ✅ HTTP requests
}
```

**Otomatik kurulur:**
```bash
npm install
```

---

## 🐛 Sorun Giderme (1 Dakika)

### Hata: `robotjs` build hatası

**Windows:**
```bash
npm install --global windows-build-tools
npm rebuild robotjs
```

**macOS:**
```bash
xcode-select --install
npm rebuild robotjs
```

**Linux:**
```bash
sudo apt-get install libxtst-dev libpng-dev
npm rebuild robotjs
```

### Hata: `wrtc` build hatası

```bash
# Node version kontrol et (14, 16, 18 destekleniyor)
node --version

# Rebuild
npm rebuild wrtc
```

### Bağlantı kurulamıyor

**Firewall kontrol:**
- UDP portları açık olmalı (WebRTC)
- STUN server'a erişim olmalı (stun.l.google.com:19302)

---

## 📊 Sistem Durumu

```bash
# Electron console'da WebRTC istatistikleri:
✅ Connection: connected
✅ ICE: connected
✅ Signaling: stable
✅ Data channel: open
```

---

## 🎮 Kontrol Testi

Web sitesinde:
1. **Mouse hareket ettir** → Electron'da mouse hareket eder
2. **Tıkla** → Electron'da tıklama olur
3. **Klavye bas** → Electron'da yazı yazar

---

## ✅ Test Checklist

- [ ] Electron başladı
- [ ] Giriş yapıldı
- [ ] Support ID alındı
- [ ] Web sitesinde bağlanıldı
- [ ] İzin verildi
- [ ] Video stream görünüyor
- [ ] Mouse kontrolü çalışıyor
- [ ] Klavye kontrolü çalışıyor

Tüm adımlar ✅ ise: **SİSTEM ÇALIŞIYOR!** 🎉

---

## 🚀 Production Hazırlığı

### 1. TURN Server Kur (NAT geçişi için)

```bash
# Coturn kurulumu (Ubuntu)
sudo apt-get install coturn

# Config
sudo nano /etc/turnserver.conf

# Başlat
sudo systemctl start coturn
```

### 2. SSL Sertifikası

WebRTC HTTPS gerektirir (production'da).

### 3. Monitoring

```javascript
// Bağlantı istatistiklerini logla
setInterval(async () => {
  const stats = await webrtcClient.getStats();
  console.log('WebRTC Stats:', stats);
}, 5000);
```

---

**Hazır!** 🎯

**Sonraki adım:** `/WEBRTC_P2P_GUIDE.md` dosyasını okuyun (detaylı bilgi için)
