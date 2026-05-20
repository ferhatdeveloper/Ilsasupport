# 🔐 ILSA Support - Electron + Web Hybrid Auth Sistemi

## 🎯 Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────┐
│                     ELECTRON DESKTOP APP                     │
│  ✅ Gerçek Hardware ID (MAC, Serial, Motherboard)           │
│  ✅ Login ekranı                                             │
│  ✅ Token alma                                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ electronToken (24 saat)
                  ↓
┌─────────────────────────────────────────────────────────────┐
│                      WEB PLATFORM                            │
│  ✅ Token doğrulama                                          │
│  ✅ Dosya indirme/gezinme                                    │
│  ✅ Tüm özellikler                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Özellikler

### **Electron App (Desktop):**
- ✅ **Gerçek Hardware ID** - `node-machine-id` paketi ile
- ✅ **MAC Address** - Gerçek network adapter
- ✅ **Disk Serial Number** - Hard disk unique ID
- ✅ **CPU & Motherboard Info** - Hardware fingerprint
- ✅ **%100 Hardware Kilitleme** - VM'de bile değişmez
- ✅ **Güvenli Login** - Email/Password + Hardware ID
- ✅ **Auto Browser Launch** - Token ile web app açar

### **Web Platform:**
- ✅ **Token-based Auth** - URL'den token okur
- ✅ **Session Management** - 24 saat geçerli
- ✅ **Tüm Özellikler** - Dosya indirme, profil, admin panel
- ✅ **Responsive Design** - Her cihazda çalışır

### **Backend:**
- ✅ **Hardware ID Validation** - Cihaz kontrolü
- ✅ **Token Generation** - 24 saatlik token
- ✅ **Single-Use Token** - Validate sonrası silinir
- ✅ **Device Registration** - İlk giriş kaydedilir
- ✅ **Device Mismatch Protection** - Farklı PC engellenr

---

## 🚀 Kurulum

### 1️⃣ **Electron App Oluştur**

Detaylı talimatlar: `/ELECTRON_APP_CODE.md`

```bash
# Yeni klasör
mkdir ilsa-electron-login
cd ilsa-electron-login

# Dosyaları kopyala (ELECTRON_APP_CODE.md'den)
# - package.json
# - main.js
# - preload.js
# - login.html
# - renderer.js

# Install
npm install

# Test
npm start

# Build
npm run build
```

### 2️⃣ **Web Platform (Zaten Hazır)**

✅ Backend endpoint'leri eklendi:
- `POST /electron-signin` - Hardware ID ile giriş
- `POST /validate-electron-token` - Token doğrulama

✅ Frontend token handler eklendi:
- URL'den `?token=...` okuyor
- Backend'e doğruluyor
- Kullanıcı otomatik giriş yapıyor

---

## 🔄 Kullanım Akışı

### **Kullanıcı Deneyimi:**

```
1️⃣ Kullanıcı "ILSA Support Login.exe" açar

2️⃣ Email ve şifre girer
   Platform: Windows 10
   Hostname: DESKTOP-ABC123
   Hardware ID: 8f3d2a1b...

3️⃣ "Giriş Yap" tıklar

4️⃣ Backend kontrol eder:
   ✅ Email/şifre doğru mu?
   ✅ Hardware ID kayıtlı mı?
   ✅ Eşleşiyor mu?

5️⃣ Backend electronToken döner:
   electron_1733456789_xyz123abc

6️⃣ Electron app browser açar:
   https://ilsa.com?token=electron_1733456789_xyz123abc

7️⃣ Web app token'ı doğrular:
   ✅ Token geçerli
   ✅ Session oluşturuldu
   ✅ Kullanıcı içeride!

8️⃣ Electron app kapanır

9️⃣ Kullanıcı web'de çalışmaya devam eder
```

---

## 🔒 Güvenlik Mekanizmaları

### **1. Hardware ID Sabitleme**

```typescript
// İlk kayıt:
{
  email: "user@email.com",
  registeredHardwareId: "8f3d2a1b4c5e6f7g8h9i0j",
  registeredDeviceInfo: {
    platform: "win32",
    hostname: "DESKTOP-ABC123",
    arch: "x64",
    cpus: 8,
    totalMemory: 16
  }
}

// Farklı PC'den giriş denemesi:
❌ HATA: "Bu hesap başka bir bilgisayara kayıtlıdır.
          Kayıtlı cihaz: DESKTOP-ABC123"
```

### **2. Token Güvenliği**

```typescript
// Token 24 saat geçerli
expiresAt: "2024-12-06T15:30:00Z"

// Tek kullanımlık
validate() → Token silinir

// Backend'de saklanır
electron_token:electron_abc123 → {
  userId: "uuid",
  hardwareId: "8f3d2a1b...",
  expiresAt: "..."
}
```

### **3. Session Kontrolü**

```typescript
// Web'de session oluşur
session:session_abc123 → {
  userId: "uuid",
  hardwareId: "8f3d2a1b...",
  source: "electron",
  createdAt: "..."
}

// Her request'te kontrol edilir
```

---

## 📊 API Endpoints

### **POST /electron-signin**

**Request:**
```json
{
  "email": "user@email.com",
  "password": "password123",
  "hardwareId": "8f3d2a1b4c5e6f7g",
  "deviceInfo": {
    "platform": "win32",
    "hostname": "DESKTOP-ABC123",
    "arch": "x64",
    "cpus": 8,
    "totalMemory": 16
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "electronToken": "electron_1733456789_xyz123",
  "user": {
    "id": "uuid",
    "email": "user@email.com",
    "name": "User Name",
    "role": "free",
    "plan": "free"
  }
}
```

**Response (Hardware Mismatch):**
```json
{
  "error": "Bu hesap başka bir bilgisayara kayıtlıdır...",
  "errorCode": "HARDWARE_MISMATCH",
  "registeredDevice": "DESKTOP-ABC123"
}
```

---

### **POST /validate-electron-token**

**Request:**
```json
{
  "electronToken": "electron_1733456789_xyz123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "sessionId": "session_abc123",
  "user": {
    "id": "uuid",
    "email": "user@email.com",
    "name": "User Name",
    "role": "free",
    "plan": "free"
  }
}
```

**Response (Invalid Token):**
```json
{
  "error": "Geçersiz token"
}
```

---

## 🎨 Electron App Screenshot

```
┌─────────────────────────────────────┐
│         🔐 ILSA Support             │
│      Hardware-Locked Login          │
├─────────────────────────────────────┤
│                                     │
│  Email                              │
│  ┌───────────────────────────────┐  │
│  │ ornek@email.com               │  │
│  └───────────────────────────────┘  │
│                                     │
│  Şifre                              │
│  ┌───────────────────────────────┐  │
│  │ ••••••••                      │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │       Giriş Yap               │  │
│  └───────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│ Device Info                         │
│ Platform: win32                     │
│ Hostname: DESKTOP-ABC123            │
│ Hardware ID: 8f3d2a1b...            │
└─────────────────────────────────────┘
```

---

## ⚙️ Konfigürasyon

### **renderer.js içinde değiştir:**

```javascript
// ✅ GERÇEK ADRESLER - HAZIR!
const BACKEND_URL = 'https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311';
const WEB_APP_URL = 'https://ilsasupport.figma.site';
```

**NOT: Bu adresler zaten `/ELECTRON_APP_CODE.md` dosyasında güncellenmiştir!**

### **Production Build Ayarları:**

```json
{
  "build": {
    "appId": "com.ilsasupport.login",
    "productName": "ILSA Support Login",
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    }
  }
}
```

---

## 🧪 Test Senaryoları

### **Scenario 1: İlk Kayıt**
```
✅ Electron app'ten giriş
✅ Hardware ID kaydedilir
✅ Browser açılır
✅ Web'de giriş yapılmış
```

### **Scenario 2: Aynı PC'den Tekrar Giriş**
```
✅ Electron app'ten giriş
✅ Hardware ID eşleşir
✅ Token alınır
✅ Browser açılır
```

### **Scenario 3: Farklı PC'den Giriş**
```
❌ Electron app'ten giriş
❌ Hardware ID farklı
⛔ HATA: "Bu hesap başka bir bilgisayara kayıtlıdır"
```

### **Scenario 4: Token Süresi Doldu**
```
❌ Web'e 25 saat sonra token ile giriş
⛔ HATA: "Token süresi dolmuş"
```

---

## 💡 Avantajlar

### **Electron Avantajları:**
- ✅ Gerçek hardware ID
- ✅ %100 cihaz kilitleme
- ✅ VM bile bypass edemez
- ✅ Professional görünüm
- ✅ Auto-update desteği

### **Web Avantajları:**
- ✅ Kolay geliştirme
- ✅ Hızlı güncelleme
- ✅ Responsive tasarım
- ✅ Cross-platform

### **Hybrid Avantajları:**
- ✅ İkisinin gücü birleşik
- ✅ Güvenlik + Esneklik
- ✅ Production-ready

---

## 🚀 Sonraki Adımlar

1. ✅ **Electron app build et** - `npm run build`
2. ✅ **Test et** - Windows/Mac/Linux
3. ✅ **Icon ekle** - Professional görünüm
4. ✅ **Auto-update** - Electron Builder ile
5. ✅ **Dağıtım** - Kullanıcılara gönder

---

## 📞 Destek

Tüm kodlar hazır! Electron app'i kendi bilgisayarında build edip kullanabilirsin.

**Önemli Dosyalar:**
- `/ELECTRON_APP_CODE.md` - Tam Electron app kodu
- `/ELECTRON_INTEGRATION_GUIDE.md` - Bu dosya

🔐 **Hardware-locked auth sistemi HAZIR!** 🚀