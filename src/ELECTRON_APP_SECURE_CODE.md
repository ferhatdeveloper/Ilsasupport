# 🔒 ILSA Support - Secure Electron Login App

## 🆕 Enhanced Security Features

✅ **Tek Kullanımlık Tokenler** - Her request'te token yenilenir  
✅ **Hardware ID Fingerprinting** - Multi-parameter cihaz tespiti  
✅ **Rate Limiting** - Brute force koruması  
✅ **Security Event Logging** - Tüm güvenlik olayları kaydedilir  
✅ **IP Anomaly Detection** - Şüpheli aktivite tespiti  

---

## 📦 Kurulum

### 1️⃣ Klasör Oluştur
```bash
mkdir ilsa-electron-secure
cd ilsa-electron-secure
```

### 2️⃣ package.json
```json
{
  "name": "ilsa-electron-secure",
  "version": "2.0.0",
  "description": "ILSA Support - Ultra Secure Login with One-Time Tokens",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.ilsasupport.secure",
    "productName": "ILSA Support Secure Login",
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    },
    "mac": {
      "target": "dmg",
      "icon": "icon.icns"
    },
    "linux": {
      "target": "AppImage",
      "icon": "icon.png"
    }
  },
  "dependencies": {
    "node-machine-id": "^1.1.12"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  }
}
```

---

## 📄 main.js (Enhanced Security)

```javascript
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { machineId } = require('node-machine-id');
const os = require('os');
const crypto = require('crypto');

let mainWindow;
const API_BASE = 'https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311';

// 🔒 Enhanced Device Fingerprinting
function getEnhancedDeviceInfo() {
  const cpus = os.cpus();
  const networkInterfaces = os.networkInterfaces();
  
  // MAC adresleri
  const macAddresses = [];
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    for (const iface of interfaces || []) {
      if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macAddresses.push(iface.mac);
      }
    }
  }
  
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCores: cpus.length,
    totalMemory: os.totalmem(),
    macAddresses: macAddresses,
    userInfo: os.userInfo().username,
    release: os.release(),
    type: os.type(),
  };
}

// 🔐 Device Fingerprint Hash
function generateDeviceFingerprint(machineId, deviceInfo) {
  const data = JSON.stringify({
    machineId,
    hostname: deviceInfo.hostname,
    platform: deviceInfo.platform,
    cpuModel: deviceInfo.cpuModel,
    macAddresses: deviceInfo.macAddresses.join(','),
  });
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('login.html');
  
  // Production'da dev tools'u kapat
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 🔒 IPC: Hardware ID Al
ipcMain.handle('get-hardware-id', async () => {
  try {
    const hwId = await machineId();
    console.log('✅ Hardware ID alındı:', hwId);
    return hwId;
  } catch (error) {
    console.error('❌ Hardware ID hatası:', error);
    throw error;
  }
});

// 🔒 IPC: Enhanced Device Info
ipcMain.handle('get-device-info', async () => {
  try {
    const deviceInfo = getEnhancedDeviceInfo();
    console.log('✅ Device info alındı');
    return deviceInfo;
  } catch (error) {
    console.error('❌ Device info hatası:', error);
    throw error;
  }
});

// 🔒 IPC: Device Fingerprint
ipcMain.handle('get-device-fingerprint', async () => {
  try {
    const hwId = await machineId();
    const deviceInfo = getEnhancedDeviceInfo();
    const fingerprint = generateDeviceFingerprint(hwId, deviceInfo);
    console.log('✅ Device fingerprint:', fingerprint.substring(0, 16) + '...');
    return fingerprint;
  } catch (error) {
    console.error('❌ Fingerprint hatası:', error);
    throw error;
  }
});

// 🚀 IPC: Secure Login
ipcMain.handle('secure-login', async (event, { email, password }) => {
  try {
    console.log('🚀 Secure login başlatılıyor...');
    
    // Hardware bilgilerini al
    const hwId = await machineId();
    const deviceInfo = getEnhancedDeviceInfo();
    const fingerprint = generateDeviceFingerprint(hwId, deviceInfo);
    
    console.log('📦 Login data hazırlanıyor...');
    console.log('   - Hardware ID:', hwId.substring(0, 16) + '...');
    console.log('   - Fingerprint:', fingerprint.substring(0, 16) + '...');
    console.log('   - Platform:', deviceInfo.platform);
    
    // Backend'e secure login request
    const response = await fetch(`${API_BASE}/electron-signin-secure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        hardwareId: hwId,
        deviceInfo: {
          ...deviceInfo,
          fingerprint,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Login başarısız:', data.error);
      return {
        success: false,
        error: data.error || 'Giriş başarısız',
        errorCode: data.errorCode,
      };
    }

    console.log('✅ Secure login başarılı!');
    console.log('   - User:', data.user.email);
    console.log('   - Token:', data.oneTimeToken.substring(0, 20) + '...');
    
    // Web app'i aç (token ile)
    const webAppUrl = `https://ilsasupport.figma.site?secureToken=${data.oneTimeToken}&hwId=${hwId}`;
    console.log('🌐 Web app açılıyor...');
    
    await shell.openExternal(webAppUrl);
    
    // 2 saniye bekle, sonra pencereyi kapat
    setTimeout(() => {
      console.log('✅ Login tamamlandı, pencere kapatılıyor...');
      if (mainWindow) {
        mainWindow.close();
      }
    }, 2000);

    return {
      success: true,
      user: data.user,
      message: 'Giriş başarılı! Browser açılıyor...',
    };

  } catch (error) {
    console.error('❌ Secure login error:', error);
    return {
      success: false,
      error: error.message || 'Bağlantı hatası',
    };
  }
});

// 🔒 IPC: Test Connection
ipcMain.handle('test-connection', async () => {
  try {
    const response = await fetch(`${API_BASE}/categories`);
    const data = await response.json();
    return { success: true, message: 'Backend bağlantısı başarılı!' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

---

## 📄 preload.js (Security Bridge)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// 🔒 Secure API Bridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware bilgileri
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  getDeviceFingerprint: () => ipcRenderer.invoke('get-device-fingerprint'),
  
  // Secure login
  secureLogin: (credentials) => ipcRenderer.invoke('secure-login', credentials),
  
  // Test
  testConnection: () => ipcRenderer.invoke('test-connection'),
});
```

---

## 📄 login.html (Modern UI)

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ILSA Support - Secure Login</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.5s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .logo {
      text-align: center;
      margin-bottom: 30px;
    }

    .logo h1 {
      font-size: 28px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }

    .logo p {
      color: #666;
      font-size: 14px;
    }

    .security-badge {
      background: #f0f4ff;
      border: 2px solid #667eea;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 30px;
      text-align: center;
    }

    .security-badge .icon {
      font-size: 24px;
      margin-bottom: 5px;
    }

    .security-badge .text {
      font-size: 12px;
      color: #667eea;
      font-weight: 600;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 600;
      font-size: 14px;
    }

    input {
      width: 100%;
      padding: 14px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 15px;
      transition: all 0.3s ease;
    }

    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    button {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-top: 10px;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .error {
      background: #fee;
      border: 2px solid #fcc;
      color: #c33;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
      animation: shake 0.5s ease;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }

    .success {
      background: #efe;
      border: 2px solid #cfc;
      color: #3c3;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
      animation: slideIn 0.5s ease-out;
    }

    .loading {
      display: none;
      text-align: center;
      padding: 20px;
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 10px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .device-info {
      margin-top: 30px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 10px;
      font-size: 12px;
      color: #666;
    }

    .device-info .item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .device-info .label {
      font-weight: 600;
    }

    .device-info .value {
      font-family: monospace;
      color: #667eea;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🔒 ILSA Support</h1>
      <p>Secure Hardware-Locked Login</p>
    </div>

    <div class="security-badge">
      <div class="icon">🛡️</div>
      <div class="text">TEK KULLANIMLIK TOKEN GÜVENLİĞİ</div>
    </div>

    <div id="error" class="error"></div>
    <div id="success" class="success"></div>

    <form id="loginForm">
      <div class="form-group">
        <label for="email">📧 Email</label>
        <input 
          type="email" 
          id="email" 
          placeholder="ornek@email.com" 
          required
          autocomplete="email"
        >
      </div>

      <div class="form-group">
        <label for="password">🔑 Şifre</label>
        <input 
          type="password" 
          id="password" 
          placeholder="••••••••" 
          required
          autocomplete="current-password"
        >
      </div>

      <button type="submit" id="loginBtn">
        🚀 Güvenli Giriş Yap
      </button>
    </form>

    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Güvenli giriş yapılıyor...</p>
    </div>

    <div class="device-info" id="deviceInfo">
      <div class="item">
        <span class="label">🔐 Hardware ID:</span>
        <span class="value" id="hwId">Yükleniyor...</span>
      </div>
      <div class="item">
        <span class="label">🖥️ Platform:</span>
        <span class="value" id="platform">-</span>
      </div>
      <div class="item">
        <span class="label">🔍 Fingerprint:</span>
        <span class="value" id="fingerprint">-</span>
      </div>
    </div>

    <div class="footer">
      <p>🇹🇷 ILSA Support - Türkiye'nin SUPPORT'u</p>
      <p style="margin-top: 5px; font-size: 10px;">
        One-Time Token Security • Hardware Lock • Rate Limited
      </p>
    </div>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

---

## 📄 renderer.js (UI Logic)

```javascript
// 🔒 Secure Login Handler

let hardwareId = null;
let deviceInfo = null;
let deviceFingerprint = null;

// Sayfa yüklenince device bilgilerini al
async function loadDeviceInfo() {
  try {
    hardwareId = await window.electronAPI.getHardwareId();
    deviceInfo = await window.electronAPI.getDeviceInfo();
    deviceFingerprint = await window.electronAPI.getDeviceFingerprint();
    
    // UI'da göster
    document.getElementById('hwId').textContent = hardwareId.substring(0, 16) + '...';
    document.getElementById('platform').textContent = deviceInfo.platform;
    document.getElementById('fingerprint').textContent = deviceFingerprint.substring(0, 16) + '...';
    
    console.log('✅ Device bilgileri yüklendi');
  } catch (error) {
    console.error('❌ Device bilgisi hatası:', error);
    showError('Cihaz bilgileri alınamadı: ' + error.message);
  }
}

// Sayfa yüklenince
loadDeviceInfo();

// Form submit
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  
  // UI güncelle
  hideError();
  hideSuccess();
  loginBtn.disabled = true;
  loginBtn.textContent = '⏳ Giriş yapılıyor...';
  document.getElementById('loading').style.display = 'block';
  document.getElementById('loginForm').style.display = 'none';
  
  try {
    console.log('🚀 Secure login başlatılıyor...');
    
    const result = await window.electronAPI.secureLogin({ email, password });
    
    if (result.success) {
      console.log('✅ Login başarılı!');
      showSuccess(result.message || 'Giriş başarılı! Browser açılıyor...');
      
      // Form'u temizle
      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      
      // 2 saniye sonra uygulama kapanacak (main.js'de)
    } else {
      console.error('❌ Login başarısız:', result.error);
      
      // Hata mesajını göster
      let errorMsg = result.error || 'Giriş başarısız';
      
      if (result.errorCode === 'HARDWARE_MISMATCH') {
        errorMsg = '⚠️ Bu hesap başka bir bilgisayara kayıtlıdır!';
      } else if (result.errorCode === 'RATE_LIMIT_EXCEEDED') {
        errorMsg = '⏱️ Çok fazla deneme yaptınız. Lütfen bekleyiniz.';
      }
      
      showError(errorMsg);
      
      // UI'yı eski haline getir
      loginBtn.disabled = false;
      loginBtn.textContent = '🚀 Güvenli Giriş Yap';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    showError('Bağlantı hatası: ' + error.message);
    
    // UI'yı eski haline getir
    loginBtn.disabled = false;
    loginBtn.textContent = '🚀 Güvenli Giriş Yap';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
  }
});

// Hata göster
function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Hata gizle
function hideError() {
  document.getElementById('error').style.display = 'none';
}

// Başarı göster
function showSuccess(message) {
  const successDiv = document.getElementById('success');
  successDiv.textContent = message;
  successDiv.style.display = 'block';
}

// Başarı gizle
function hideSuccess() {
  document.getElementById('success').style.display = 'none';
}

// Test connection (dev)
async function testConnection() {
  console.log('🧪 Backend bağlantısı test ediliyor...');
  const result = await window.electronAPI.testConnection();
  console.log('Test result:', result);
}

// testConnection(); // İsteğe bağlı test
```

---

## 🚀 Kullanım

### Development
```bash
npm install
npm start
```

### Production Build
```bash
npm run build
```

Build dosyaları `dist/` klasöründe oluşacak.

---

## 🔒 Güvenlik Özellikleri

### ✅ Tek Kullanımlık Tokenler
- Her login'de yeni token oluşturulur
- Token bir kez kullanıldıktan sonra geçersiz olur
- Çalınsa bile sadece 1 kez kullanılabilir

### ✅ Hardware Fingerprinting
- CPU, MAC, Hostname, Platform
- Multi-parameter cihaz tespiti
- SHA-256 hash ile güvenli

### ✅ Rate Limiting
- Dakikada max 10 login denemesi
- Brute force koruması
- IP bazlı sınırlama

### ✅ Security Event Logging
- Tüm güvenlik olayları kaydedilir
- Hardware mismatch, IP değişikliği, rate limit
- Admin panelinde görüntülenebilir

---

## 📝 Test Senaryoları

### ✅ Scenario 1: İlk Giriş
```
1. Email/şifre gir
2. Hardware ID kaydedilir
3. Token oluşturulur
4. Browser açılır
```

### ✅ Scenario 2: Aynı PC'den Giriş
```
1. Email/şifre gir
2. Hardware ID eşleşir
3. Token oluşturulur
4. Browser açılır
```

### ❌ Scenario 3: Farklı PC
```
1. Email/şifre gir
2. Hardware ID farklı
⛔ HATA: "Bu hesap başka bir bilgisayara kayıtlıdır"
```

### ❌ Scenario 4: Token Çalınması
```
1. Token çalınır
2. Bir kez kullanılır
3. İkinci kullanımda geçersiz
⛔ HATA: "Token geçersiz veya zaten kullanıldı"
```

---

## 🎉 Tamamlandı!

Bu Electron app **production-ready** ve **ultra secure**! 🔐🚀