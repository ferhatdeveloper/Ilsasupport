# 🚀 ILSA Support - Electron App Entegrasyon

## 📁 Dokümantasyon Dosyaları

Bu klasörde Electron uygulamanızı backend ile entegre etmek için gereken tüm bilgiler bulunmaktadır:

### 📄 Dosyalar:

1. **`ELECTRON_APP_INTEGRATION.md`** - Ana entegrasyon rehberi
   - Hardware ID alma
   - Login implementasyonu
   - Token rotation sistemi
   - API çağrıları
   - Kod örnekleri
   - **👉 BURADAN BAŞLAYIN!**

2. **`ELECTRON_TROUBLESHOOTING.md`** - Sorun giderme rehberi
   - "No files in this category yet" sorunu
   - Debug checklist
   - Sık sorulan sorular
   - Hızlı fix adımları

---

## ⚡ Hızlı Başlangıç

### 1️⃣ Gerekli Paketleri Yükleyin

```bash
npm install node-machine-id electron-store
```

### 2️⃣ main.js - Hardware ID Desteği Ekleyin

```javascript
const { ipcMain } = require('electron');
const { machineIdSync } = require('node-machine-id');

ipcMain.handle('get-hardware-id', async () => {
  return machineIdSync();
});
```

### 3️⃣ preload.js - API Expose Edin

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
});
```

### 4️⃣ renderer.js - Login Kodunu Değiştirin

```javascript
// ESKİ: Web login
// fetch('/signin', ...)

// YENİ: Electron secure login
const hardwareId = await window.electronAPI.getHardwareId();

const response = await fetch(
  'https://[PROJECT_ID].supabase.co/functions/v1/make-server-47081311/electron-signin-secure',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@ilsa.com',
      password: 'Admin123!',
      hardwareId,
      deviceInfo: {
        os: 'Windows 10',
        platform: 'win32',
      }
    })
  }
);

const data = await response.json();

// Token'ı kaydet
localStorage.setItem('secureToken', data.oneTimeToken);
localStorage.setItem('hardwareId', hardwareId);
localStorage.setItem('user', JSON.stringify(data.user));
```

### 5️⃣ API Çağrılarını Güncelleyin

```javascript
async function secureApiCall(endpoint, options = {}) {
  const token = localStorage.getItem('secureToken');
  const hardwareId = localStorage.getItem('hardwareId');
  
  const response = await fetch(
    `https://[PROJECT_ID].supabase.co/functions/v1/make-server-47081311${endpoint}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Hardware-ID': hardwareId, // ✅ ZORUNLU!
        ...(options.headers || {}),
      }
    }
  );
  
  // 🔄 YENİ TOKEN'I AL VE KAYDET
  const newToken = response.headers.get('X-New-Token');
  if (newToken) {
    localStorage.setItem('secureToken', newToken);
  }
  
  return await response.json();
}

// Kullanım:
const files = await secureApiCall('/files-filtered?categoryId=123');
```

---

## 🔑 Test Hesapları

```
Admin:
Email: admin@ilsa.com
Şifre: Admin123!

Premium:
Email: premium@test.com
Şifre: Premium123!

Free:
Email: free@test.com
Şifre: Free123!
```

---

## ✅ Doğrulama

Login sonrası backend console'da şunu görmelisiniz:

```
✅ Secure session created for user abc123
🔐 Electron secure token detected - validating...
✅ Electron user authenticated: admin@ilsa.com (admin)
🔄 Token rotated for user abc123 (secure mode)
📁 Sending 125 files (Plan: admin)
```

Frontend console'da:

```
✅ Login başarılı: admin@ilsa.com
🔄 Token rotated - yeni token kaydediliyor
📁 125 dosya yüklendi (Plan: admin)
```

---

## 🐛 Sorun mu Yaşıyorsunuz?

1. **Dosyalar görünmüyor?** → `ELECTRON_TROUBLESHOOTING.md` dosyasını okuyun
2. **Token hatası?** → `X-Hardware-ID` header'ını gönderdiğinizden emin olun
3. **Hardware ID alamıyorsunuz?** → `node-machine-id` paketini yükleyin

---

## 📚 Ek Kaynaklar

- **Backend Endpoint'ler:** `/supabase/functions/server/index.tsx`
- **Security Middleware:** `/supabase/functions/server/security_middleware.tsx`
- **Supabase Dashboard:** https://supabase.com/dashboard

---

## 🔒 Güvenlik Özellikleri

✅ **Tek Kullanımlık Tokenler** - Her token sadece 1 kez kullanılabilir  
✅ **Token Rotation** - Her API call'da otomatik yenilenir  
✅ **Hardware Lock** - Hesap tek bir bilgisayara kilitlenir  
✅ **Session Expiration** - 7 gün sonra otomatik expire  
✅ **IP Anomaly Detection** - Şüpheli IP değişikliklerini tespit eder  
✅ **Rate Limiting** - DDoS koruması  

---

## 📞 İletişim

Sorularınız için backend loglarını kontrol edin:

```
Supabase Dashboard → Edge Functions → make-server-47081311 → Logs
```

---

**Başarılar! 🎉**

*Son Güncelleme: 2025-01-02*  
*Backend Version: v2.0 (Secure Token Rotation)*
