# 🔧 Electron App - Sorun Giderme Rehberi

## 🐛 Sorun: "No files in this category yet"

Screenshot'unuzda görünen sorun budur. Kategoriye tıkladığınızda dosyalar görünmüyor.

### 🔍 Nedeni:

Electron uygulamanız backend'e istek atarken **eski token sistemi** kullanıyor, ancak backend artık **secure token rotation** sistemi kullanıyor.

#### Şu anda ne oluyor:

```javascript
// Electron App (ESKİ KOD):
fetch('/files-filtered?categoryId=123', {
  headers: {
    'Authorization': 'Bearer SUPABASE_JWT_TOKEN', // ❌ Yanlış token tipi!
  }
})

// Backend:
// ❌ Token'ı Supabase Auth ile validate etmeye çalışıyor
// ❌ Secure token lookup başarısız oluyor
// ❌ User bilgisi alınamıyor
// ❌ userPlan = 'free' oluyor (default)
// ❌ Dosyalar filtrelenmiyor ama boş liste dönüyor
```

#### Olması gereken:

```javascript
// Electron App (YENİ KOD):
fetch('/files-filtered?categoryId=123', {
  headers: {
    'Authorization': 'Bearer ONE_TIME_TOKEN', // ✅ Secure token
    'X-Hardware-ID': 'DEVICE_HARDWARE_ID',    // ✅ Hardware ID
  }
})

// Backend Response:
{
  success: true,
  files: [...],
  userPlan: 'admin',
}

// Response Headers:
X-New-Token: NEW_ONE_TIME_TOKEN // ✅ Yeni token
```

---

## ✅ Çözüm Adımları

### 1️⃣ Login Kodunu Değiştirin

**ESKİ KOD (Değiştirin):**
```javascript
// ❌ Web login endpoint'i kullanıyor
fetch('/signin', {
  method: 'POST',
  body: JSON.stringify({ email, password })
})
```

**YENİ KOD:**
```javascript
// ✅ Electron secure login endpoint'i
const hardwareId = await window.electronAPI.getHardwareId();

fetch('/electron-signin-secure', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    password,
    hardwareId,
    deviceInfo: {
      os: await window.electronAPI.getOS(),
      platform: await window.electronAPI.getPlatform(),
    }
  })
})
.then(res => res.json())
.then(data => {
  // ✅ Secure token kaydet
  localStorage.setItem('secureToken', data.oneTimeToken);
  localStorage.setItem('hardwareId', hardwareId);
  localStorage.setItem('user', JSON.stringify(data.user));
});
```

---

### 2️⃣ API Çağrılarını Değiştirin

**ESKİ KOD (Değiştirin):**
```javascript
// ❌ Token rotation yok
fetch('/files-filtered?categoryId=123', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
})
```

**YENİ KOD:**
```javascript
// ✅ Token rotation ile
async function getFiles(categoryId) {
  const token = localStorage.getItem('secureToken');
  const hardwareId = localStorage.getItem('hardwareId');
  
  const response = await fetch(`/files-filtered?categoryId=${categoryId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Hardware-ID': hardwareId, // ✅ Zorunlu!
    }
  });
  
  // ✅ Yeni token'ı al ve kaydet
  const newToken = response.headers.get('X-New-Token');
  if (newToken) {
    localStorage.setItem('secureToken', newToken);
    console.log('🔄 Token yenilendi');
  }
  
  const data = await response.json();
  return data.files;
}
```

---

### 3️⃣ Hardware ID Implementasyonu

**main.js (Electron Main Process):**

```javascript
const { ipcMain } = require('electron');
const { machineIdSync } = require('node-machine-id');

// npm install node-machine-id

ipcMain.handle('get-hardware-id', async () => {
  try {
    return machineIdSync();
  } catch (error) {
    console.error('Hardware ID error:', error);
    return null;
  }
});

ipcMain.handle('get-os', async () => {
  const os = require('os');
  return `${os.type()} ${os.release()}`;
});

ipcMain.handle('get-platform', async () => {
  return process.platform;
});
```

**preload.js:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  getOS: () => ipcRenderer.invoke('get-os'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
});
```

**renderer.js:**

```javascript
// Artık kullanabilirsiniz:
const hwId = await window.electronAPI.getHardwareId();
```

---

## 🧪 Test Etme

### 1. Console Logları:

**Backend'de görmeli:**
```
🔐 Electron secure token detected - validating...
✅ Electron user authenticated: admin@ilsa.com (admin)
🔄 Token rotated for user abc123 (secure mode)
🔄 New token sent in response header
📁 Sending 47 files (Plan: admin)
```

**Frontend'de görmeli:**
```
🔄 Token yenilendi
📁 125 dosya yüklendi (Plan: admin)
```

### 2. Network Tab:

**Request Headers:**
```
Authorization: Bearer eyJhbGc...
X-Hardware-ID: ABC123-UNIQUE-ID
```

**Response Headers:**
```
X-New-Token: eyJhbGc...
```

---

## ❓ Sık Sorulan Sorular

### Q: "Hardware ID nasıl alınır?"
**A:** `node-machine-id` paketi kullanın:
```bash
npm install node-machine-id
```

### Q: "Token her seferinde değişiyor mu?"
**A:** Evet! Bu güvenlik özelliğidir. Her API call'da yeni token alır, eski token yanar.

### Q: "Eski token'ı tekrar kullanırsam ne olur?"
**A:** 401 hatası alırsınız ve logout olursunuz.

### Q: "Hardware ID değişirse ne olur?"
**A:** 403 hatası alırsınız ve logout olursunuz. Backend admin panelinden `registeredDeviceId`'yi sıfırlamalısınız.

### Q: "Web versiyonu hala çalışıyor mu?"
**A:** Evet! Web versiyonu normal Supabase Auth kullanmaya devam eder. Sadece Electron uygulaması secure token kullanır.

### Q: "Dosyalar hala görünmüyor!"
**A:** Şu kontrolleri yapın:
1. `X-Hardware-ID` header'ını gönderdiniz mi?
2. Backend console'da "Electron secure token detected" görüyor musunuz?
3. Response'da `X-New-Token` geliyor mu?
4. Token'ı her response'dan sonra güncelliyor musunuz?

---

## 🚀 Hızlı Fix (Copy-Paste)

Eğer hızlıca çalışır hale getirmek istiyorsanız:

**1. Package yükle:**
```bash
npm install node-machine-id
```

**2. main.js'e ekle:**
```javascript
const { machineIdSync } = require('node-machine-id');
ipcMain.handle('get-hardware-id', () => machineIdSync());
```

**3. preload.js'e ekle:**
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
});
```

**4. Login kodunuzu değiştirin:**
```javascript
const hardwareId = await window.electronAPI.getHardwareId();
const response = await fetch(
  'https://[PROJECT].supabase.co/functions/v1/make-server-47081311/electron-signin-secure',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, hardwareId, deviceInfo: {} })
  }
);
const data = await response.json();
localStorage.setItem('secureToken', data.oneTimeToken);
localStorage.setItem('hardwareId', hardwareId);
```

**5. Tüm API çağrılarınıza ekleyin:**
```javascript
const newToken = response.headers.get('X-New-Token');
if (newToken) localStorage.setItem('secureToken', newToken);
```

**6. Her request'e header ekleyin:**
```javascript
headers: {
  'Authorization': `Bearer ${localStorage.getItem('secureToken')}`,
  'X-Hardware-ID': localStorage.getItem('hardwareId'),
}
```

✅ Artık dosyalar görünmeli!

---

## 📊 Debug Checklist

Sorun devam ediyorsa:

- [ ] `node-machine-id` paketi yüklendi mi?
- [ ] `window.electronAPI.getHardwareId()` çalışıyor mu?
- [ ] Login `/electron-signin-secure` endpoint'ini kullanıyor mu?
- [ ] `oneTimeToken` localStorage'a kaydediliyor mu?
- [ ] Her API request'te `X-Hardware-ID` gönderiliyor mu?
- [ ] Response'daki `X-New-Token` header'ı okunuyor mu?
- [ ] Yeni token localStorage'a kaydediliyor mu?
- [ ] Backend console'da "Electron secure token detected" görünüyor mu?
- [ ] Network tab'da request/response header'ları doğru mu?

---

**Başarılar! 🎉**

Daha fazla yardım için: `ELECTRON_APP_INTEGRATION.md` dosyasını inceleyin.
