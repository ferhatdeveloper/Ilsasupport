# 🚀 ILSA Support - Electron Login App

## 📦 Kurulum Talimatları

### 1️⃣ Yeni Klasör Oluştur
```bash
mkdir ilsa-electron-login
cd ilsa-electron-login
```

### 2️⃣ package.json Oluştur
Aşağıdaki içeriği `package.json` dosyasına kaydet:

```json
{
  "name": "ilsa-electron-login",
  "version": "1.0.0",
  "description": "ILSA Support Hardware-Locked Login App",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.ilsasupport.login",
    "productName": "ILSA Support Login",
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

### 3️⃣ npm install
```bash
npm install
```

---

## 📄 Dosyalar

### `main.js` (Electron Main Process)

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { machineId } = require('node-machine-id');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 650,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('login.html');
  
  // Dev tools (production'da kapat)
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

// Hardware ID al
ipcMain.handle('get-hardware-id', async () => {
  try {
    const hwId = await machineId();
    
    return {
      hardwareId: hwId,
      deviceInfo: {
        platform: os.platform(),
        hostname: os.hostname(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: Math.floor(os.totalmem() / 1024 / 1024 / 1024), // GB
      }
    };
  } catch (error) {
    console.error('Hardware ID alınamadı:', error);
    return {
      hardwareId: null,
      deviceInfo: null,
      error: error.message,
    };
  }
});

// Web browser aç
ipcMain.handle('open-browser', async (event, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
  
  // 2 saniye sonra uygulamayı kapat
  setTimeout(() => {
    app.quit();
  }, 2000);
  
  return true;
});
```

---

### `preload.js` (Security Bridge)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
});
```

---

### `login.html` (UI)

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ILSA Support - Login</title>
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
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 400px;
      padding: 40px 30px;
    }

    .logo {
      text-align: center;
      margin-bottom: 30px;
    }

    .logo-icon {
      font-size: 64px;
      margin-bottom: 10px;
    }

    .logo-text {
      font-size: 28px;
      font-weight: bold;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 5px;
    }

    .subtitle {
      color: #666;
      font-size: 14px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
      font-size: 14px;
    }

    input {
      width: 100%;
      padding: 12px 15px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 14px;
      transition: all 0.3s;
    }

    input:focus {
      outline: none;
      border-color: #667eea;
    }

    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .btn:hover {
      transform: translateY(-2px);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .error {
      background: #fee;
      color: #c33;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
    }

    .error.show {
      display: block;
    }

    .success {
      background: #efe;
      color: #3c3;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;
      display: none;
      text-align: center;
    }

    .success.show {
      display: block;
    }

    .device-info {
      margin-top: 30px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 10px;
      font-size: 12px;
      color: #666;
    }

    .device-info-item {
      margin: 5px 0;
      display: flex;
      justify-content: space-between;
    }

    .device-info-label {
      font-weight: 600;
    }

    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <div class="logo-icon">🔐</div>
      <div class="logo-text">ILSA Support</div>
      <div class="subtitle">Hardware-Locked Login</div>
    </div>

    <div id="errorMessage" class="error"></div>
    <div id="successMessage" class="success"></div>

    <form id="loginForm">
      <div class="form-group">
        <label for="email">Email</label>
        <input 
          type="email" 
          id="email" 
          name="email" 
          placeholder="ornek@email.com" 
          required
          autocomplete="email"
        >
      </div>

      <div class="form-group">
        <label for="password">Şifre</label>
        <input 
          type="password" 
          id="password" 
          name="password" 
          placeholder="••••••••" 
          required
          autocomplete="current-password"
        >
      </div>

      <button type="submit" class="btn" id="loginBtn">
        Giriş Yap
      </button>
    </form>

    <div class="device-info">
      <div class="device-info-item">
        <span class="device-info-label">Platform:</span>
        <span id="platform">-</span>
      </div>
      <div class="device-info-item">
        <span class="device-info-label">Hostname:</span>
        <span id="hostname">-</span>
      </div>
      <div class="device-info-item">
        <span class="device-info-label">Hardware ID:</span>
        <span id="hardwareId" style="font-family: monospace; font-size: 10px;">-</span>
      </div>
    </div>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

---

### `renderer.js` (UI Logic)

```javascript
// BACKEND URL - GERÇEK ADRESLER ✅
const BACKEND_URL = 'https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311';
const WEB_APP_URL = 'https://markup-cart-82234705.figma.site';

let deviceData = null;

// Hardware bilgilerini yükle
async function loadDeviceInfo() {
  try {
    const result = await window.electronAPI.getHardwareId();
    
    if (result.error) {
      showError('Hardware ID alınamadı: ' + result.error);
      return;
    }

    deviceData = result;

    // UI'ye yaz
    document.getElementById('platform').textContent = result.deviceInfo.platform;
    document.getElementById('hostname').textContent = result.deviceInfo.hostname;
    document.getElementById('hardwareId').textContent = 
      result.hardwareId.substring(0, 16) + '...';

    console.log('✅ Hardware ID yüklendi:', result.hardwareId);

  } catch (error) {
    console.error('Hardware bilgisi yüklenemedi:', error);
    showError('Cihaz bilgisi yüklenemedi');
  }
}

// Sayfa yüklendiğinde
loadDeviceInfo();

// Form submit
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!deviceData || !deviceData.hardwareId) {
    showError('Cihaz bilgisi yüklenmedi. Lütfen uygulamayı yeniden başlatın.');
    return;
  }

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');

  // Loading state
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="loading"></span>Giriş yapılıyor...';

  try {
    // 🔒 YENİ: Secure endpoint kullan
    const response = await fetch(`${BACKEND_URL}/electron-signin-secure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        hardwareId: deviceData.hardwareId,
        deviceInfo: deviceData.deviceInfo,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Giriş başarısız');
    }

    // 🔒 YENİ: oneTimeToken ile browser aç
    if (result.success && result.oneTimeToken) {
      showSuccess('✅ Giriş başarılı! Tarayıcı açılıyor...');

      // Web browser'ı tek kullanımlık token ile aç
      const webUrl = `${WEB_APP_URL}?token=${result.oneTimeToken}`;
      await window.electronAPI.openBrowser(webUrl);

      console.log('✅ Browser açıldı:', webUrl);

      // Not: app.quit() main.js'de 2 saniye sonra çalışacak
    } else {
      throw new Error('Token alınamadı');
    }

  } catch (error) {
    console.error('Login hatası:', error);
    showError(error.message);
    
    // Reset button
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Giriş Yap';
  }
});

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = '❌ ' + message;
  errorEl.classList.add('show');
  
  setTimeout(() => {
    errorEl.classList.remove('show');
  }, 5000);
}

function showSuccess(message) {
  const successEl = document.getElementById('successMessage');
  successEl.textContent = message;
  successEl.classList.add('show');
  
  // Success mesajını kapatma (browser açıldıktan sonra app kapanacak)
}
```

---

## 🚀 Çalıştırma

### Development Mode
```bash
npm start
```

### Production Build
```bash
npm run build
```

**Build sonucu:**
- Windows: `dist/ILSA Support Login Setup 1.0.0.exe`
- Mac: `dist/ILSA Support Login-1.0.0.dmg`
- Linux: `dist/ILSA Support Login-1.0.0.AppImage`

---

## ⚙️ Önemli Notlar

### 1. `renderer.js` içindeki URL'leri değiştir:
```javascript
const BACKEND_URL = 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-47081311';
const WEB_APP_URL = 'https://YOUR_WEB_APP_URL.com';
```

### 2. Icon dosyaları ekle (opsiyonel):
- `icon.ico` (Windows)
- `icon.icns` (Mac)
- `icon.png` (Linux)

### 3. Güvenlik:
- Production'da `main.js` içindeki DevTools satırını kapat
- HTTPS kullan (Supabase zaten HTTPS)

---

## 📊 Akış Diyagramı

```
1. Electron App açılır
2. Hardware ID otomatik alınır (node-machine-id)
3. Kullanıcı email/şifre girer
4. Backend'e POST /electron-signin
5. Backend hardware ID kontrol eder
6. Eğer OK → electronToken döner (24 saat geçerli)
7. Electron → Web browser açar: 
   https://ilsa.com?token=electron_abc123...
8. Web App token'ı doğrular → Kullanıcı giriş yapmış olur
9. Electron App kapanır
```

---

## 🔒 Güvenlik

✅ **Gerçek Hardware ID** (MAC, Disk Serial, Motherboard UUID)  
✅ **Token sadece 24 saat geçerli**  
✅ **Tek kullanımlık token** (validate sonrası siliniyor)  
✅ **Hardware değişikliği = Giriş engelleniyor**  
✅ **Context Isolation** (Electron güvenlik)  

---

## 📞 Destek

Bu Electron uygulamasını kendi bilgisayarınızda build edip kullanabilirsiniz!

**Build Komutları:**
```bash
npm install
npm start          # Test
npm run build      # Production build
```

🚀 **HAZIR!**