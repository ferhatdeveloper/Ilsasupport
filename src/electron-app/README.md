# ILSA Support - Electron Desktop App

Modern ve güvenli firmware indirme platformu için masaüstü uygulaması. Hardware-locked authentication ve uzaktan destek sistemi ile donatılmıştır.

## 🎯 Özellikler

### ✅ Temel Özellikler
- **Hardware-Locked Authentication** - Cihaza bağlı güvenli giriş sistemi
- **🎥 WebRTC P2P Uzaktan Destek** - Peer-to-peer ekran paylaşımı ve kontrol
- **Sistem Tepsisi** - Arka planda çalışma desteği
- **Cross-Platform** - Windows, Mac, Linux desteği
- **Modern UI** - Gradient tasarım ve animasyonlar
- **Güvenli IPC** - Context isolation ile sandbox

### 🎥 WebRTC P2P Uzaktan Destek (YENİ!)
- **P2P Bağlantı** - Direkt peer-to-peer, merkezi sunucu yok
- **Düşük Latency** - < 100ms gecikme
- **Ekran Paylaşımı** - Gerçek zamanlı 1080p video stream
- **Uzaktan Kontrol** - Mouse ve klavye kontrolü (robot.js)
- **İzin Sistemi** - Kullanıcı onayı gerektirir
- **STUN/TURN** - NAT traversal desteği
- **Güvenli** - End-to-end şifreli bağlantı

## 📁 Proje Yapısı

```
electron-app/
├── src/
│   ├── main.js          # Ana Electron process
│   ├── preload.js       # Güvenli IPC bridge
│   └── webrtc-client.js # 🎥 WebRTC P2P client (YENİ!)
├── pages/
│   ├── login.html       # Giriş sayfası
│   └── support.html     # Uzaktan destek penceresi
├── scripts/
│   ├── login.js         # Giriş mantığı
│   └── support.js       # Destek mantığı + WebRTC UI
├── assets/
│   ├── icon.ico         # Windows icon
│   ├── icon.icns        # Mac icon
│   ├── icon.png         # Linux icon
│   └── tray-icon.png    # Sistem tepsisi icon
├── package.json
└── README.md
```

## 🚀 Kurulum

### Gereksinimler
- Node.js 16+
- npm veya yarn
- **Platform-specific build tools** (WebRTC ve Robot.js için)

**Windows:**
```bash
npm install --global windows-build-tools
```

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt-get install libxtst-dev libpng-dev
```

### 1. Bağımlılıkları Yükle
```bash
cd electron-app
npm install

# Dependencies:
# - node-machine-id (Hardware ID)
# - ws (WebSocket)
# - robotjs (Mouse/keyboard control) 🎥 YENİ
# - wrtc (WebRTC for Node.js) 🎥 YENİ
# - node-fetch (HTTP requests) 🎥 YENİ
```

### 2. Development Mode
```bash
npm start
```

### 3. Production Build
```bash
# Tüm platformlar için
npm run build

# Sadece Windows
npm run build:win

# Sadece Mac
npm run build:mac

# Sadece Linux
npm run build:linux
```

## 🔧 Yapılandırma

### Backend URL'lerini Güncelle

`src/main.js` dosyasında:

```javascript
const BACKEND_URL = 'https://rleiiezkvhrzmbccqock.supabase.co';
const WEB_URL = 'https://markup-cart-82234705.figma.site';
```

### Icon Dosyaları

`assets/` klasörüne aşağıdaki dosyaları ekleyin:

- **icon.ico** - Windows (256x256 px)
- **icon.icns** - Mac (512x512 px)
- **icon.png** - Linux & Tray (512x512 px)

## 📖 Kullanım

### Giriş Yapma

1. Uygulamayı başlat
2. Email ve şifre ile giriş yap
3. Browser otomatik açılır
4. Uygulama sistem tepsisinde çalışır

### Uzaktan Destek Talebi

1. Ana pencerede "Uzaktan Destek Talebi" butonuna tıkla
2. Destek ID'ni kopyala (örn: `ILSA-A1B2C3D4`)
3. Bu ID'yi destek ekibine ilet
4. Destek ekibi bağlantı talebi gönderir
5. Onay/Reddet seçeneği çıkar
6. Onaylarsan uzaktan erişim başlar

### Sistem Tepsisi

Uygulama sistem tepsisinde çalışır:

- **Sol Tık** - Ana pencereyi göster/gizle
- **Sağ Tık** - Menü:
  - Ana Pencere
  - Uzaktan Destek
  - Çıkış

## 🔒 Güvenlik

### Hardware ID
- `node-machine-id` paketi kullanılır
- MAC, Disk, CPU, Motherboard bilgileri
- VM'de bile çalışır
- Değiştirilemez

### Token Sistemi
- 24 saatlik geçerlilik
- Tek kullanımlık
- Backend'de doğrulanır
- Browser'a güvenli şekilde aktarılır

### Uzaktan Destek
- Kullanıcı onayı zorunlu
- Tüm işlemler loglanır
- Session tabanlı
- İstendiğinde sonlandırılabilir

## 🧪 Test

### Demo Giriş Bilgileri

#### Admin
```
Email: admin@ilsasupport.com
Şifre: Admin123456!
```

#### Premium
```
Email: premium@ilsasupport.com
Şifre: Premium123456!
```

#### Free
```
Email: demo@ilsasupport.com
Şifre: Demo123456!
```

## 📦 Build Çıktıları

Build sonrası `dist/` klasöründe:

### Windows
- `ILSA Support Setup.exe` (~150 MB)
- NSIS installer
- Desktop shortcut

### Mac
- `ILSA Support.dmg` (~180 MB)
- Drag & drop installer
- Notarized (opsiyonel)

### Linux
- `ILSA Support.AppImage` (~160 MB)
- Portable executable
- No installation required

## 🐛 Sorun Giderme

### Hardware ID Alınamıyor
```bash
# node-machine-id yeniden yükle
npm uninstall node-machine-id
npm install node-machine-id@1.1.12

# Admin izni gerekebilir (Windows)
# Run as Administrator
```

### Build Hatası
```bash
# Global electron-builder yükle
npm install -g electron-builder

# Cache temizle
npm cache clean --force
rm -rf node_modules
npm install
```

### Backend Bağlantı Hatası
- URL'leri kontrol et (`src/main.js`)
- CORS ayarlarını kontrol et (backend)
- Internet bağlantısını kontrol et

### DevTools Açma
`src/main.js` içinde:
```javascript
if (process.argv.includes('--dev')) {
  mainWindow.webContents.openDevTools(); // Bu satırın yorumunu aç
}
```

Sonra:
```bash
npm start -- --dev
```

## 🔄 Güncelleme

### Manuel Güncelleme
1. Yeni versiyonu indir
2. Eski sürümü kaldır
3. Yeni sürümü yükle
4. Ayarlar korunur

### Otomatik Güncelleme (Gelecek)
- electron-updater entegrasyonu
- GitHub Releases üzerinden
- Arka planda güncelleme
- Kullanıcı onayı ile yeniden başlatma

## 📞 Destek

### Dokümantasyon
- `/electron-app/QUICKSTART.txt` - Hızlı başlangıç
- `/QUICK_DEMO_SETUP.md` - Demo hesaplar
- `/START_HERE.md` - Genel bakış

### API Endpoints
- `POST /electron-signin` - Giriş
- `GET /get-support-id` - Destek ID al
- `POST /request-support` - Destek talebi
- `POST /respond-support-request` - Talebi yanıtla

## 🎯 Roadmap

- [ ] Otomatik güncelleme sistemi
- [ ] VNC/RDP tam entegrasyonu
- [ ] Offline mod
- [ ] Çoklu dil desteği
- [ ] Dark/Light theme
- [ ] Sistem bildirimleri
- [ ] Dosya indirme yöneticisi
- [ ] Uygulama içi chat

## 📄 Lisans

Bu proje ILSA Support platformunun bir parçasıdır.

## 👥 Ekip

- Hardware-locked auth sistemi
- Uzaktan destek entegrasyonu
- Modern Electron mimarisi
- Production-ready güvenlik

---

**Son Güncelleme:** 2025-12-31
**Versiyon:** 2.0.0
**Platform:** Electron 28+
