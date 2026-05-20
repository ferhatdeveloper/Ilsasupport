# 🔧 ILSA Support - Electron App Konfigürasyon

## 📌 Backend URL Bilgileri

Electron uygulamanızda aşağıdaki bilgileri kullanın:

### Supabase Project ID:
```
rleiiezkvhrzmbccqock
```

### Public Anon Key:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZWlpZXprdmhyem1iY2Nxb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk5MjgsImV4cCI6MjA4MDQ0NTkyOH0.uTXWNV94mmMj-Z35t0sil44ZwuzsMTEmZQ1TE0ogiZM
```

### Base API URL:
```
https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311
```

---

## 💾 Electron App - config.js Dosyası

Electron uygulamanızın root klasöründe `config.js` dosyası oluşturun:

```javascript
// config.js
module.exports = {
  // Supabase Backend
  SUPABASE_PROJECT_ID: 'rleiiezkvhrzmbccqock',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZWlpZXprdmhyem1iY2Nxb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk5MjgsImV4cCI6MjA4MDQ0NTkyOH0.uTXWNV94mmMj-Z35t0sil44ZwuzsMTEmZQ1TE0ogiZM',
  
  // API Endpoints
  API_BASE_URL: 'https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311',
  
  // Endpoint'ler
  ENDPOINTS: {
    // Auth
    ELECTRON_SIGNIN: '/electron-signin-secure',
    LOGOUT: '/logout-secure',
    PROFILE: '/profile-secure',
    
    // Kategoriler
    BRANDS: '/brands',
    CATEGORIES: '/categories',
    SUBCATEGORIES: '/subcategories',
    
    // Dosyalar
    FILES: '/files-filtered',
    LATEST_FILES: '/latest-files',
    REQUEST_DOWNLOAD: '/request-download',
    DOWNLOAD: '/download',
    
    // Admin (sadece admin kullanıcılar için)
    ADMIN_STATS: '/admin/stats',
    ADMIN_USERS: '/admin/users',
    ADMIN_FILES: '/admin/files',
  },
  
  // Güvenlik
  SECURITY: {
    TOKEN_STORAGE_KEY: 'secureToken',
    HARDWARE_ID_KEY: 'hardwareId',
    USER_DATA_KEY: 'user',
  },
};
```

---

## 🚀 Kullanım Örneği

### renderer.js veya benzeri dosyalarda:

```javascript
// config.js dosyasını import edin
const config = require('./config.js');

// Login
async function login(email, password) {
  const hardwareId = await window.electronAPI.getHardwareId();
  
  const response = await fetch(
    config.API_BASE_URL + config.ENDPOINTS.ELECTRON_SIGNIN,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, hardwareId, deviceInfo: {} })
    }
  );
  
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem(config.SECURITY.TOKEN_STORAGE_KEY, data.oneTimeToken);
    localStorage.setItem(config.SECURITY.HARDWARE_ID_KEY, hardwareId);
    localStorage.setItem(config.SECURITY.USER_DATA_KEY, JSON.stringify(data.user));
  }
  
  return data;
}

// Dosyaları getir
async function getFiles(categoryId) {
  const token = localStorage.getItem(config.SECURITY.TOKEN_STORAGE_KEY);
  const hardwareId = localStorage.getItem(config.SECURITY.HARDWARE_ID_KEY);
  
  const response = await fetch(
    `${config.API_BASE_URL}${config.ENDPOINTS.FILES}?categoryId=${categoryId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hardware-ID': hardwareId,
      }
    }
  );
  
  // Token rotation
  const newToken = response.headers.get('X-New-Token');
  if (newToken) {
    localStorage.setItem(config.SECURITY.TOKEN_STORAGE_KEY, newToken);
  }
  
  return await response.json();
}

// Dosya indir
async function downloadFile(fileId) {
  const token = localStorage.getItem(config.SECURITY.TOKEN_STORAGE_KEY);
  const hardwareId = localStorage.getItem(config.SECURITY.HARDWARE_ID_KEY);
  
  const response = await fetch(
    `${config.API_BASE_URL}${config.ENDPOINTS.REQUEST_DOWNLOAD}?fileId=${fileId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hardware-ID': hardwareId,
      }
    }
  );
  
  const newToken = response.headers.get('X-New-Token');
  if (newToken) {
    localStorage.setItem(config.SECURITY.TOKEN_STORAGE_KEY, newToken);
  }
  
  const data = await response.json();
  
  if (data.success && data.downloadUrl) {
    window.open(data.downloadUrl, '_blank');
  }
  
  return data;
}

// Logout
async function logout() {
  try {
    const token = localStorage.getItem(config.SECURITY.TOKEN_STORAGE_KEY);
    const hardwareId = localStorage.getItem(config.SECURITY.HARDWARE_ID_KEY);
    
    await fetch(
      config.API_BASE_URL + config.ENDPOINTS.LOGOUT,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Hardware-ID': hardwareId,
        }
      }
    );
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem(config.SECURITY.TOKEN_STORAGE_KEY);
    localStorage.removeItem(config.SECURITY.HARDWARE_ID_KEY);
    localStorage.removeItem(config.SECURITY.USER_DATA_KEY);
    
    window.location.href = '/login.html';
  }
}
```

---

## 🔐 Test Hesapları

```javascript
const TEST_ACCOUNTS = {
  admin: {
    email: 'admin@ilsa.com',
    password: 'Admin123!',
    plan: 'admin',
    features: ['unlimited_downloads', 'all_files', 'admin_panel'],
  },
  
  premium: {
    email: 'premium@test.com',
    password: 'Premium123!',
    plan: 'premium',
    features: ['unlimited_downloads', 'premium_files', '3_sessions'],
  },
  
  free: {
    email: 'free@test.com',
    password: 'Free123!',
    plan: 'free',
    features: ['5_daily_downloads', 'free_files_only', '1_session'],
  },
};
```

---

## 📊 Environment Variables (Opsiyonel)

Eğer `.env` dosyası kullanmak isterseniz:

**.env:**
```env
SUPABASE_PROJECT_ID=rleiiezkvhrzmbccqock
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZWlpZXprdmhyem1iY2Nxb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk5MjgsImV4cCI6MjA4MDQ0NTkyOH0.uTXWNV94mmMj-Z35t0sil44ZwuzsMTEmZQ1TE0ogiZM
API_BASE_URL=https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311
```

**config.js (with .env):**
```javascript
require('dotenv').config();

module.exports = {
  SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  API_BASE_URL: process.env.API_BASE_URL,
  // ... rest of config
};
```

---

## ⚠️ Güvenlik Notları

1. **Anon Key Güvenliği:**
   - Public Anon Key kodda olabilir (güvenli)
   - Service Role Key asla frontend'e koyMAYIN!

2. **Hardware ID:**
   - Hassas bilgi DEĞİL, hash'lenmiş cihaz ID'si
   - Backend'de güvenlik kontrolü için kullanılır

3. **Token Storage:**
   - localStorage yerine `electron-store` kullanın (şifreli)
   - Production'da token'ları console.log() yazmayın

---

## 🧪 Debug Mode

Debug için console.log'ları etkinleştirin:

```javascript
const DEBUG = true; // Production'da false yapın

function debugLog(message, data) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data);
  }
}

// Kullanım:
debugLog('Login response:', data);
debugLog('Token rotated:', newToken.substring(0, 20) + '...');
debugLog('Files loaded:', files.length);
```

---

**Son Güncelleme:** 2025-01-02  
**Backend Version:** v2.0 (Secure Token Rotation)
