# 🔐 ILSA Support - Electron App Entegrasyon Rehberi

Bu dokümantasyon, local Electron uygulamanızın backend ile çalışması için yapmanız gereken değişiklikleri detaylıca açıklar.

---

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Hardware ID Alma](#1-hardware-id-alma)
3. [Login İşlemi](#2-login-işlemi-electron-secure-signin)
4. [Token Rotation Sistemi](#3-token-rotation-sistemi)
5. [API İstekleri](#4-api-istekleri)
6. [Token Storage](#5-token-storage)
7. [Logout İşlemi](#6-logout-işlemi)
8. [Hata Yönetimi](#7-hata-yönetimi)
9. [Kod Örnekleri](#kod-örnekleri)

---

## Genel Bakış

Backend'de **Secure Token Rotation** sistemi implement edildi. Bu sistem:

- ✅ **Tek Kullanımlık Tokenler** - Her token sadece 1 kez kullanılabilir
- ✅ **Otomatik Token Yenileme** - Her API response'da yeni token gelir
- ✅ **Hardware Lock** - Hesap tek bir bilgisayara kilitlenir
- ✅ **Güvenlik** - Token replay attack'e karşı korumalı

### 🔄 Token Rotation Akışı:

```
1. Login → OneTimeToken-1 alırsınız
2. API Call → Token-1 gönderilir
3. Response → X-New-Token: OneTimeToken-2 gelir
4. Token-1 YAKILIR (artık kullanılamaz)
5. Token-2 kaydedilir
6. Sonraki API Call → Token-2 gönderilir
... ve böyle devam eder
```

---

## 1. Hardware ID Alma

### Neden Gerekli?
Backend, hesabı tek bir bilgisayara kilitler. Farklı cihazdan giriş yapılmasını engeller.

### Nasıl Alınır?

**Node.js Kullanarak:**

```javascript
// package.json - Gerekli paket
{
  "dependencies": {
    "node-machine-id": "^1.1.12"
  }
}

// main.js veya preload.js
const { machineIdSync } = require('node-machine-id');

function getHardwareId() {
  try {
    const hwId = machineIdSync();
    console.log('🔐 Hardware ID:', hwId);
    return hwId;
  } catch (error) {
    console.error('Hardware ID alınamadı:', error);
    return null;
  }
}

// IPC ile renderer'a gönder
ipcMain.handle('get-hardware-id', async () => {
  return getHardwareId();
});
```

**Renderer'da Kullanım:**

```javascript
// renderer.js
const hardwareId = await window.electronAPI.getHardwareId();
```

**Alternatif: OS Info ile Custom ID:**

```javascript
const os = require('os');
const crypto = require('crypto');

function getHardwareId() {
  const cpus = os.cpus();
  const networkInterfaces = os.networkInterfaces();
  
  // CPU + MAC address kombinasyonu
  const cpuModel = cpus[0]?.model || 'unknown';
  const macAddress = Object.values(networkInterfaces)
    .flat()
    .find(i => i.mac && i.mac !== '00:00:00:00:00:00')?.mac || 'unknown';
  
  // Hash oluştur
  const hash = crypto.createHash('sha256')
    .update(`${cpuModel}-${macAddress}-${os.platform()}`)
    .digest('hex');
  
  return hash;
}
```

---

## 2. Login İşlemi (Electron Secure Signin)

### Endpoint:
```
POST https://[project].supabase.co/functions/v1/make-server-47081311/electron-signin-secure
```

### Request Body:

```json
{
  "email": "admin@ilsa.com",
  "password": "Admin123!",
  "hardwareId": "ABC123-UNIQUE-DEVICE-ID",
  "deviceInfo": {
    "os": "Windows 10",
    "platform": "win32",
    "arch": "x64",
    "hostname": "DESKTOP-PC",
    "cpuModel": "Intel Core i7"
  }
}
```

### Response (Success):

```json
{
  "success": true,
  "oneTimeToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "uuid-session-id",
  "user": {
    "id": "user-uuid",
    "email": "admin@ilsa.com",
    "name": "Admin User",
    "role": "admin",
    "plan": "admin"
  }
}
```

### Response (Error):

```json
{
  "error": "Bu hesap başka bir bilgisayara kayıtlıdır.",
  "errorCode": "HARDWARE_MISMATCH"
}
```

### JavaScript Kodu:

```javascript
async function electronSignIn(email, password) {
  try {
    // 1. Hardware ID al
    const hardwareId = await window.electronAPI.getHardwareId();
    
    if (!hardwareId) {
      throw new Error('Hardware ID alınamadı');
    }
    
    // 2. Device bilgilerini topla
    const deviceInfo = {
      os: await window.electronAPI.getOS(),
      platform: await window.electronAPI.getPlatform(),
      arch: await window.electronAPI.getArch(),
      hostname: await window.electronAPI.getHostname(),
      cpuModel: await window.electronAPI.getCPUModel(),
    };
    
    // 3. Backend'e login isteği gönder
    const response = await fetch(
      'https://[PROJECT_ID].supabase.co/functions/v1/make-server-47081311/electron-signin-secure',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          hardwareId,
          deviceInfo,
        }),
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      // Hata yönetimi
      if (data.errorCode === 'HARDWARE_MISMATCH') {
        alert('⚠️ Bu hesap başka bir bilgisayara kayıtlıdır!');
      } else {
        alert(`Giriş başarısız: ${data.error}`);
      }
      return null;
    }
    
    // 4. Token'ı ve user bilgilerini kaydet
    localStorage.setItem('secureToken', data.oneTimeToken);
    localStorage.setItem('hardwareId', hardwareId);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    console.log('✅ Login başarılı:', data.user.email);
    
    return data;
    
  } catch (error) {
    console.error('Login hatası:', error);
    alert(`Bağlantı hatası: ${error.message}`);
    return null;
  }
}
```

---

## 3. Token Rotation Sistemi

### ⚠️ ÖNEMLİ:
Her API response'dan **X-New-Token** header'ını okumalı ve eski token'ın yerine kaydetmelisiniz!

### Token Rotation Fonksiyonu:

```javascript
/**
 * API çağrısı yapar ve token rotation'ı otomatik halleder
 */
async function secureApiCall(endpoint, options = {}) {
  try {
    const currentToken = localStorage.getItem('secureToken');
    const hardwareId = localStorage.getItem('hardwareId');
    
    if (!currentToken) {
      throw new Error('Token bulunamadı. Lütfen giriş yapın.');
    }
    
    // Headers hazırla
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`,
      'X-Hardware-ID': hardwareId,
      ...(options.headers || {}),
    };
    
    // Request yap
    const response = await fetch(
      `https://[PROJECT_ID].supabase.co/functions/v1/make-server-47081311${endpoint}`,
      {
        ...options,
        headers,
      }
    );
    
    // 🔄 YENİ TOKEN'I AL VE KAYDET
    const newToken = response.headers.get('X-New-Token');
    if (newToken) {
      console.log('🔄 Token rotated - yeni token kaydediliyor');
      localStorage.setItem('secureToken', newToken);
    }
    
    // Response parse et
    const data = await response.json();
    
    // Hata kontrolü
    if (!response.ok) {
      // Token geçersiz - logout yap
      if (response.status === 401 || data.errorCode === 'TOKEN_INVALID') {
        console.error('🚨 Token geçersiz - logout yapılıyor');
        handleLogout();
        alert('Oturumunuz sonlandı. Lütfen tekrar giriş yapın.');
        return null;
      }
      
      // Hardware mismatch
      if (data.errorCode === 'HARDWARE_MISMATCH') {
        console.error('🚨 Farklı cihazdan erişim tespit edildi');
        handleLogout();
        alert('Güvenlik nedeniyle oturumunuz sonlandırıldı.');
        return null;
      }
      
      throw new Error(data.error || 'API hatası');
    }
    
    return data;
    
  } catch (error) {
    console.error('🚨 Secure API call error:', error);
    throw error;
  }
}
```

---

## 4. API İstekleri

### 📁 Dosyaları Getir (files-filtered):

```javascript
async function getFiles(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.brandId) params.append('brandId', filters.brandId);
    if (filters.categoryId) params.append('categoryId', filters.categoryId);
    if (filters.subcategoryId) params.append('subcategoryId', filters.subcategoryId);
    if (filters.search) params.append('search', filters.search);
    
    const query = params.toString() ? `?${params.toString()}` : '';
    
    const data = await secureApiCall(`/files-filtered${query}`, {
      method: 'GET',
    });
    
    console.log(`📁 ${data.files.length} dosya yüklendi (Plan: ${data.userPlan})`);
    
    return data.files;
    
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    return [];
  }
}
```

### 📥 Dosya İndir (request-download):

```javascript
async function downloadFile(fileId) {
  try {
    const data = await secureApiCall(`/request-download?fileId=${fileId}`, {
      method: 'POST',
    });
    
    if (data.success) {
      console.log(`📥 İndirme hazır: ${data.fileName}`);
      console.log(`🔗 Download URL: ${data.downloadUrl}`);
      
      // Dosyayı indir
      if (data.useDirectDownload) {
        // Direct download (Google Drive API)
        window.open(data.downloadUrl, '_blank');
      } else {
        // Fallback
        window.open(data.fallbackUrl, '_blank');
      }
    }
    
    return data;
    
  } catch (error) {
    console.error('İndirme hatası:', error);
    alert(`İndirme başarısız: ${error.message}`);
  }
}
```

### 👤 Profil Bilgilerini Al:

```javascript
async function getProfile() {
  try {
    const data = await secureApiCall('/profile-secure', {
      method: 'GET',
    });
    
    if (data.success) {
      console.log('👤 Profil:', data.user);
      return data.user;
    }
    
  } catch (error) {
    console.error('Profil yükleme hatası:', error);
  }
}
```

### 🏢 Markaları Getir (Public - Token Gerekmez):

```javascript
async function getBrands() {
  try {
    const response = await fetch(
      'https://[PROJECT_ID].supabase.co/functions/v1/make-server-47081311/brands',
      {
        headers: {
          'Authorization': 'Bearer [PUBLIC_ANON_KEY]',
        },
      }
    );
    
    const data = await response.json();
    return data.brands || [];
    
  } catch (error) {
    console.error('Marka yükleme hatası:', error);
    return [];
  }
}
```

---

## 5. Token Storage

### Local Storage Kullanımı:

```javascript
// Token kaydet
function saveToken(token) {
  localStorage.setItem('secureToken', token);
}

// Token al
function getToken() {
  return localStorage.getItem('secureToken');
}

// Token temizle
function clearToken() {
  localStorage.removeItem('secureToken');
  localStorage.removeItem('hardwareId');
  localStorage.removeItem('user');
}

// Token geçerli mi kontrol et
function hasValidToken() {
  const token = getToken();
  return !!token;
}

// User bilgilerini al
function getUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}
```

### Electron Store Kullanımı (Önerilen):

```javascript
// package.json
{
  "dependencies": {
    "electron-store": "^8.1.0"
  }
}

// main.js
const Store = require('electron-store');
const store = new Store({
  encryptionKey: 'your-secret-key-here', // Şifreleme için
});

// Token kaydet
store.set('secureToken', token);

// Token al
const token = store.get('secureToken');

// Token temizle
store.delete('secureToken');
store.delete('hardwareId');
store.delete('user');
```

---

## 6. Logout İşlemi

```javascript
async function handleLogout() {
  try {
    // Backend'e logout isteği gönder
    await secureApiCall('/logout-secure', {
      method: 'POST',
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Token'ları temizle
    clearToken();
    
    // Login sayfasına yönlendir
    window.location.href = '/login.html';
  }
}
```

---

## 7. Hata Yönetimi

### Token Geçersiz (401):

```javascript
if (response.status === 401 || data.errorCode === 'TOKEN_INVALID') {
  console.error('🚨 Token geçersiz');
  clearToken();
  alert('Oturumunuz sonlandı. Lütfen tekrar giriş yapın.');
  window.location.href = '/login.html';
}
```

### Hardware Mismatch (403):

```javascript
if (data.errorCode === 'HARDWARE_MISMATCH') {
  console.error('🚨 Farklı cihazdan erişim tespit edildi');
  clearToken();
  alert('Bu hesap başka bir bilgisayardan kullanılıyor. Güvenlik nedeniyle oturumunuz sonlandırıldı.');
  window.location.href = '/login.html';
}
```

### Rate Limit (429):

```javascript
if (response.status === 429) {
  alert('Çok fazla istek gönderdiniz. Lütfen bekleyiniz.');
}
```

### Network Error:

```javascript
try {
  await secureApiCall('/files-filtered');
} catch (error) {
  if (error.message.includes('fetch')) {
    alert('Bağlantı hatası. İnternet bağlantınızı kontrol edin.');
  } else {
    alert(`Hata: ${error.message}`);
  }
}
```

---

## Kod Örnekleri

### Tam Login + Dosya Listeleme Örneği:

```javascript
// ===== LOGIN =====
const loginButton = document.getElementById('loginBtn');
loginButton.addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  const result = await electronSignIn(email, password);
  
  if (result && result.success) {
    // Login başarılı - ana sayfaya git
    window.location.href = '/home.html';
  }
});

// ===== HOME PAGE =====
window.addEventListener('load', async () => {
  // Token kontrolü
  if (!hasValidToken()) {
    window.location.href = '/login.html';
    return;
  }
  
  // User bilgilerini göster
  const user = getUser();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userPlan').textContent = user.plan;
  
  // Dosyaları yükle
  await loadFiles();
});

async function loadFiles() {
  try {
    const files = await getFiles({
      brandId: selectedBrand,
      categoryId: selectedCategory,
    });
    
    // Dosyaları listele
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <h3>${file.name}</h3>
        <p>${file.size} MB</p>
        <button onclick="downloadFile('${file.id}')">İndir</button>
      `;
      fileList.appendChild(fileItem);
    });
    
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    alert('Dosyalar yüklenemedi');
  }
}
```

### IPC Communication (Electron):

```javascript
// main.js (Main Process)
const { ipcMain } = require('electron');
const { machineIdSync } = require('node-machine-id');
const os = require('os');

ipcMain.handle('get-hardware-id', async () => {
  return machineIdSync();
});

ipcMain.handle('get-os', async () => {
  return `${os.type()} ${os.release()}`;
});

ipcMain.handle('get-platform', async () => {
  return os.platform();
});

ipcMain.handle('get-arch', async () => {
  return os.arch();
});

ipcMain.handle('get-hostname', async () => {
  return os.hostname();
});

ipcMain.handle('get-cpu-model', async () => {
  return os.cpus()[0]?.model || 'Unknown';
});

// preload.js (Preload Script)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  getOS: () => ipcRenderer.invoke('get-os'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getArch: () => ipcRenderer.invoke('get-arch'),
  getHostname: () => ipcRenderer.invoke('get-hostname'),
  getCPUModel: () => ipcRenderer.invoke('get-cpu-model'),
});

// renderer.js (Renderer Process)
async function getDeviceInfo() {
  return {
    hardwareId: await window.electronAPI.getHardwareId(),
    os: await window.electronAPI.getOS(),
    platform: await window.electronAPI.getPlatform(),
    arch: await window.electronAPI.getArch(),
    hostname: await window.electronAPI.getHostname(),
    cpuModel: await window.electronAPI.getCPUModel(),
  };
}
```

---

## 🎯 Özet Checklist

Electron uygulamanızda yapmanız gerekenler:

- [ ] **Hardware ID** alma fonksiyonunu implement edin
- [ ] **Login** işlemini `/electron-signin-secure` endpoint'ine yönlendirin
- [ ] **Token Rotation** - Her API response'dan `X-New-Token` header'ını okuyup kaydedin
- [ ] **X-Hardware-ID** header'ını her API request'te gönderin
- [ ] **Token Storage** - Token'ı güvenli bir şekilde saklayın (Electron Store önerilen)
- [ ] **Hata Yönetimi** - 401/403 hatalarında logout yapın
- [ ] **API Calls** - Tüm API çağrılarını `secureApiCall()` fonksiyonu ile yapın

---

## 📞 Destek

Sorun yaşarsanız backend console loglarını kontrol edin:
- Supabase Dashboard → Edge Functions → Logs

Debug için faydalı loglar:
```
🔐 Electron secure token detected - validating...
✅ Electron user authenticated: admin@ilsa.com (admin)
🔄 Token rotated for user [userId] (secure mode)
🔄 New token sent in response header
```

---

## ⚠️ Önemli Notlar

1. **Hardware ID Değişikliği:**
   - Kullanıcı bilgisayarını formatlarsa veya donanım değiştirirse hesabı kullanamaz
   - Admin olarak backend'den `registeredDeviceId`'yi sıfırlayabilirsiniz
   - Veya `forceLogin` parametresi ekleyebilirsiniz (gelecek feature)

2. **Token Expiration:**
   - Tokenler 7 gün sonra otomatik expire olur
   - Kullanıcı tekrar login yapmalıdır

3. **Offline Mode:**
   - Offline kullanım desteklenmez (her API call internet gerektirir)
   - Gelecekte offline cache eklenebilir

4. **Security:**
   - Token'ları asla console.log() ile yazdırmayın (production'da)
   - Hardware ID'yi şifreli saklayın
   - HTTPS kullanın (self-signed certificate kabul edilmeli)

---

**Son Güncelleme:** 2025-01-02  
**Backend Version:** v2.0 (Secure Token Rotation)  
**Electron Minimum Version:** v20.0.0+
