const { app, BrowserWindow, ipcMain, shell, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { machineIdSync } = require('node-machine-id');
const WebSocket = require('ws');
const WebRTCClient = require('./webrtc-client');

let mainWindow = null;
let supportWindow = null;
let tray = null;
let currentUser = null;
let wsConnection = null;
let webrtcClient = null; // WebRTC P2P bağlantısı

// Backend URL
const BACKEND_URL = 'https://rleiiezkvhrzmbccqock.supabase.co';
const WEB_URL = 'https://markup-cart-82234705.figma.site';

// Hardware ID
function getHardwareId() {
  try {
    return machineIdSync({ original: true });
  } catch (error) {
    console.error('Hardware ID alınamadı:', error);
    return 'fallback-' + Date.now();
  }
}

// Ana pencere oluştur
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    backgroundColor: '#000000',
    show: false,
    frame: true,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../pages/login.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // DevTools (development mode)
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Uzaktan destek penceresi
function createSupportWindow() {
  if (supportWindow) {
    supportWindow.focus();
    return;
  }

  supportWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#000000',
    parent: mainWindow,
    modal: false,
    show: false,
    frame: true,
    icon: path.join(__dirname, '../assets/icon.png')
  });

  supportWindow.loadFile(path.join(__dirname, '../pages/support.html'));

  supportWindow.once('ready-to-show', () => {
    supportWindow.show();
  });

  supportWindow.on('closed', () => {
    supportWindow = null;
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  });
}

// WebSocket bağlantısı (uzaktan destek için)
function connectSupportWebSocket(userId) {
  if (wsConnection) {
    wsConnection.close();
  }

  // WebSocket sunucusuna bağlan
  wsConnection = new WebSocket(`wss://${BACKEND_URL.replace('https://', '')}/functions/v1/make-server-47081311/support-ws`);

  wsConnection.on('open', () => {
    console.log('WebSocket bağlantısı açıldı');
    wsConnection.send(JSON.stringify({
      type: 'register',
      userId: userId,
      hardwareId: getHardwareId()
    }));
  });

  wsConnection.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (supportWindow) {
        supportWindow.webContents.send('support-message', message);
      }

      // İzin talebi geldiğinde
      if (message.type === 'permission-request') {
        handleSupportRequest(message);
      }
    } catch (error) {
      console.error('WebSocket mesaj hatası:', error);
    }
  });

  wsConnection.on('error', (error) => {
    console.error('WebSocket hatası:', error);
    if (supportWindow) {
      supportWindow.webContents.send('support-error', 'Bağlantı hatası');
    }
  });

  wsConnection.on('close', () => {
    console.log('WebSocket bağlantısı kapandı');
    wsConnection = null;
  });
}

// Destek talebi işle
async function handleSupportRequest(request) {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['İzin Ver', 'Reddet'],
    defaultId: 1,
    title: 'Uzaktan Destek Talebi',
    message: `Destek talebi alındı`,
    detail: `Destek ID: ${request.supportId}\nDestek veren: ${request.supporterName || 'ILSA Support Team'}\n\nUzaktan erişim izni vermek istiyor musunuz?`
  });

  const response = {
    type: 'permission-response',
    requestId: request.requestId,
    approved: result.response === 0,
    userId: currentUser.id
  };

  // Backend'e cevabı gönder
  try {
    const res = await fetch(`${BACKEND_URL}/functions/v1/make-server-47081311/respond-support-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId: request.requestId,
        approved: result.response === 0,
        supportId: request.supportId,
      }),
    });

    const data = await res.json();
    console.log('Support request response:', data);

    if (result.response === 0 && data.success) {
      // İzin verildi
      if (supportWindow) {
        supportWindow.webContents.send('support-granted', {
          supportId: request.supportId,
          sessionId: data.sessionId,
          message: 'Uzaktan destek başlatılıyor...'
        });
      }

      // 🎥 WebRTC P2P bağlantısını başlat
      console.log('🎥 WebRTC P2P bağlantısı başlatılıyor...');
      startWebRTCConnection(request.supportId);
    }
  } catch (error) {
    console.error('Support request response error:', error);
  }

  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(response));
  }
}

// 🎥 WebRTC P2P bağlantısını başlat
async function startWebRTCConnection(supportId) {
  try {
    console.log('🚀 WebRTC başlatılıyor:', supportId);

    // Önceki bağlantıyı kapat
    if (webrtcClient) {
      await webrtcClient.close();
      webrtcClient = null;
    }

    // Yeni WebRTC client oluştur
    webrtcClient = new WebRTCClient(supportId, BACKEND_URL);
    
    // Bağlantıyı başlat
    await webrtcClient.start();

    console.log('✅ WebRTC başlatıldı, offer bekleniyor...');

    // Support window'a bilgi gönder
    if (supportWindow) {
      supportWindow.webContents.send('webrtc-status', {
        status: 'waiting',
        message: 'Destek ekibinin bağlanması bekleniyor...'
      });
    }

    // Bağlantı durumunu periyodik olarak kontrol et
    const statusInterval = setInterval(async () => {
      if (!webrtcClient) {
        clearInterval(statusInterval);
        return;
      }

      const stats = await webrtcClient.getStats();
      
      if (supportWindow) {
        supportWindow.webContents.send('webrtc-stats', stats);
      }

      // Bağlantı kurulduysa
      if (webrtcClient.isConnected()) {
        console.log('✅ WebRTC P2P bağlantısı kuruldu!');
        if (supportWindow) {
          supportWindow.webContents.send('webrtc-status', {
            status: 'connected',
            message: 'Uzaktan destek aktif - Ekranınız paylaşılıyor'
          });
        }
      }
    }, 2000);

  } catch (error) {
    console.error('❌ WebRTC başlatma hatası:', error);
    
    if (supportWindow) {
      supportWindow.webContents.send('webrtc-status', {
        status: 'error',
        message: `Bağlantı hatası: ${error.message}`
      });
    }
  }
}

// WebRTC bağlantısını kapat
async function stopWebRTCConnection() {
  if (webrtcClient) {
    console.log('🔴 WebRTC bağlantısı kapatılıyor...');
    await webrtcClient.close();
    webrtcClient = null;

    if (supportWindow) {
      supportWindow.webContents.send('webrtc-status', {
        status: 'disconnected',
        message: 'Uzaktan destek sonlandırıldı'
      });
    }
  }
}

// Sistem tepsisi
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ILSA Support',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Ana Pencere',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Uzaktan Destek',
      click: () => {
        if (currentUser) {
          createSupportWindow();
        } else {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Giriş Gerekli',
            message: 'Uzaktan destek için önce giriş yapmalısınız.'
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ILSA Support');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// IPC Handlers
ipcMain.handle('get-hardware-id', () => {
  return getHardwareId();
});

ipcMain.handle('signin', async (event, { email, password }) => {
  try {
    const hardwareId = getHardwareId();
    
    const response = await fetch(`${BACKEND_URL}/functions/v1/make-server-47081311/electron-signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, hardwareId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Giriş başarısız');
    }

    // Kullanıcı bilgilerini sakla
    currentUser = data.user;

    // WebSocket bağlantısı kur
    connectSupportWebSocket(currentUser.id);

    // Web browser'ı aç
    const webUrl = `${WEB_URL}?token=${data.electronToken}`;
    shell.openExternal(webUrl);

    return { success: true, user: data.user };
  } catch (error) {
    console.error('Giriş hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('signup', async (event, { email, password, name }) => {
  try {
    const response = await fetch(`${BACKEND_URL}/functions/v1/make-server-47081311/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, name })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Kayıt başarısız');
    }

    return { success: true, message: 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.' };
  } catch (error) {
    console.error('Kayıt hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-support-window', () => {
  if (!currentUser) {
    return { success: false, error: 'Önce giriş yapmalısınız' };
  }
  createSupportWindow();
  return { success: true };
});

ipcMain.handle('get-support-id', () => {
  if (!currentUser) {
    return { success: false, error: 'Kullanıcı bilgisi bulunamadı' };
  }
  
  // Kullanıcı ID'sini destek ID olarak kullan
  const supportId = `ILSA-${currentUser.id.substring(0, 8).toUpperCase()}`;
  
  return { 
    success: true, 
    supportId: supportId,
    userId: currentUser.id,
    email: currentUser.email,
    name: currentUser.name
  };
});

ipcMain.handle('send-support-message', (event, message) => {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'support-message',
      userId: currentUser.id,
      message: message
    }));
    return { success: true };
  }
  return { success: false, error: 'Bağlantı yok' };
});

ipcMain.handle('close-support', async () => {
  // WebRTC bağlantısını kapat
  await stopWebRTCConnection();
  
  // WebSocket bağlantısını kapat
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  
  // Support window'u kapat
  if (supportWindow) {
    supportWindow.close();
  }
  
  return { success: true };
});

// WebRTC istatistiklerini al
ipcMain.handle('get-webrtc-stats', async () => {
  if (webrtcClient) {
    return await webrtcClient.getStats();
  }
  return null;
});

// WebRTC durumunu kontrol et
ipcMain.handle('is-webrtc-connected', () => {
  if (webrtcClient) {
    return webrtcClient.isConnected();
  }
  return false;
});

// App hazır
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Tüm pencereler kapandığında
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App kapanırken
app.on('before-quit', () => {
  if (wsConnection) {
    wsConnection.close();
  }
});

// Hata yakalama
process.on('uncaughtException', (error) => {
  console.error('Yakalanmamış hata:', error);
});