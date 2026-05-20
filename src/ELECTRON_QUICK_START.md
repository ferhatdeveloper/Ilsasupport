# ⚡ Electron Login App - 5 Dakikada Kurulum

## 🎯 GERÇEK ADRESLERLE HAZIR!

✅ Backend URL: `https://rleiiezkvhrzmbccqock.supabase.co`  
✅ Web App URL: `https://ilsasupport.figma.site`  

**Tüm kodlar zaten bu adreslerle güncellenmiş!**

---

## 📦 Adım Adım Kurulum

### 1️⃣ Klasör Oluştur
```bash
mkdir ilsa-electron-login
cd ilsa-electron-login
```

---

### 2️⃣ Dosyaları Oluştur

#### 📄 **package.json**
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

---

#### 📄 **main.js**
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

#### 📄 **preload.js**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
});
```

---

#### 📄 **login.html**

Detaylı HTML kodu için `/ELECTRON_APP_CODE.md` dosyasına bakın (sayfa boyutu için buraya koymadım).

Veya basitleştirilmiş versiyon: Modern gradient tasarım, form, device info gösterimi içerir.

**NOT:** Tam HTML kodu `/ELECTRON_APP_CODE.md` içinde mevcut. Oradan kopyala-yapıştır yapabilirsin.

---

#### 📄 **renderer.js**
```javascript
// ✅ GERÇEK ADRESLER - HAZIR!
const BACKEND_URL = 'https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311';
const WEB_APP_URL = 'https://ilsasupport.figma.site';

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
    const response = await fetch(`${BACKEND_URL}/electron-signin`, {
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

    if (result.success && result.electronToken) {
      showSuccess('✅ Giriş başarılı! Tarayıcı açılıyor...');

      // Web browser'ı token ile aç
      const webUrl = `${WEB_APP_URL}?token=${result.electronToken}`;
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

### 3️⃣ Kurulum
```bash
npm install
```

---

### 4️⃣ Test
```bash
npm start
```

**Test için mevcut hesap:**
- Email: Sistemde kayıtlı herhangi bir email
- Şifre: İlgili şifre

---

### 5️⃣ Build
```bash
npm run build
```

**Çıktılar:**
- Windows: `dist/ILSA Support Login Setup 1.0.0.exe`
- Mac: `dist/ILSA Support Login-1.0.0.dmg`
- Linux: `dist/ILSA Support Login-1.0.0.AppImage`

---

## 🔥 Hızlı Kopya-Yapıştır

Tüm dosyalar `/ELECTRON_APP_CODE.md` içinde hazır. Sadece:

1. Yeni klasör aç
2. 5 dosyayı kopyala-yapıştır
3. `npm install`
4. `npm start`

**HAZIR!** 🚀

---

## 🧪 Test Akışı

```
1. Electron app aç
2. Email: test@ilsa.com (örnek)
3. Şifre: ******
4. "Giriş Yap" tıkla
5. ✅ Browser otomatik açılır
6. ✅ Web'de giriş yapılmış
7. Electron app kapanır
```

---

## 🔒 Güvenlik

✅ Gerçek Hardware ID  
✅ %100 Cihaz kilitleme  
✅ 24 saatlik token  
✅ Tek kullanımlık doğrulama  

---

## 📞 Sorun mu var?

Detaylı dokümantasyon için:
- `/ELECTRON_APP_CODE.md` - Tam kod
- `/ELECTRON_INTEGRATION_GUIDE.md` - Detaylı rehber
- `/README_ELECTRON_AUTH.md` - Genel bakış

---

**⚡ 5 DAKİKADA HAZIR!** 🎯