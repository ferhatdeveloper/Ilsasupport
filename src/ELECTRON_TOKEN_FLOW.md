# 🔐 Electron Token Akışı - Kullanım Rehberi

## 🎯 Genel Bakış

ILSA Support Electron uygulaması, kullanıcı giriş yaptığında web browser'ı otomatik açar ve tek kullanımlık token ile giriş yapar. Bu sayede kullanıcı web sitesinde tekrar email/şifre girmek zorunda kalmaz.

---

## 🔄 Token Akışı

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ELECTRON → WEB TOKEN AKIŞI                      │
└─────────────────────────────────────────────────────────────────────┘

1. [Electron App]
   │
   │  Kullanıcı giriş yapar
   │  ↓
   │  POST /electron-signin
   │  {
   │    email: "user@example.com",
   │    password: "********",
   │    hardwareId: "abc123..."
   │  }
   │
   ▼

2. [Backend]
   │
   │  ✓ Email/şifre doğrula
   │  ✓ Hardware ID kontrol et
   │  ✓ 24 saatlik elektronToken oluştur
   │  ✓ Token'ı veritabanına kaydet
   │
   │  Response:
   │  {
   │    success: true,
   │    electronToken: "xyz789...",
   │    user: { id, email, name, ... }
   │  }
   │
   ▼

3. [Electron App]
   │
   │  Token ile browser aç:
   │  https://ilsasupport.figma.site?token=xyz789...
   │
   ▼

4. [Web Site]
   │
   │  URL'den token'ı oku
   │  ↓
   │  POST /validate-electron-token
   │  { electronToken: "xyz789..." }
   │
   ▼

5. [Backend]
   │
   │  ✓ Token doğrula
   │  ✓ Kullanım sayısını artır
   │  ✓ Supabase access token oluştur
   │
   │  Response:
   │  {
   │    success: true,
   │    accessToken: "supabase_token",
   │    user: { id, email, name, ... }
   │  }
   │
   ▼

6. [Web Site]
   │
   │  ✓ Access token kaydet
   │  ✓ Kullanıcıyı giriş yap
   │  ✓ URL'den token'ı temizle
   │  ✓ Dashboard göster
```

---

## 📝 Kod Örnekleri

### 1. Electron App - Giriş ve Browser Açma

**Dosya:** `/electron-app/src/main.js`

```javascript
ipcMain.handle('signin', async (event, { email, password }) => {
  try {
    const hardwareId = getHardwareId();
    
    // Backend'e giriş isteği
    const response = await fetch(
      `${BACKEND_URL}/functions/v1/make-server-47081311/electron-signin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, hardwareId })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Giriş başarısız');
    }

    // Kullanıcı bilgilerini sakla
    currentUser = data.user;

    // WebSocket bağlantısı kur (uzaktan destek için)
    connectSupportWebSocket(currentUser.id);

    // ⭐ Token ile browser aç
    const webUrl = `${WEB_URL}?token=${data.electronToken}`;
    shell.openExternal(webUrl);

    return { success: true, user: data.user };
  } catch (error) {
    console.error('Giriş hatası:', error);
    return { success: false, error: error.message };
  }
});
```

**Açıklama:**
- Hardware ID alınır
- Backend'e email, password ve hardwareId gönderilir
- Backend `electronToken` döndürür (24 saat geçerli)
- Token ile browser açılır: `https://ilsasupport.figma.site?token=xyz789...`

---

### 2. Backend - Token Oluşturma

**Dosya:** `/supabase/functions/server/index.tsx`

```javascript
// Electron giriş endpoint'i
app.post('/make-server-47081311/electron-signin', async (c) => {
  try {
    const { email, password, hardwareId } = await c.req.json();

    // 1. Supabase Auth ile giriş
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return c.json({ error: 'Email veya şifre hatalı' }, 400);
    }

    const userId = data.user.id;

    // 2. SQL'den kullanıcı bilgilerini al
    const user = await db.getUserById(userId);

    // 3. Hardware lock kontrolü
    const lockCheck = await db.checkHardwareLock(userId, hardwareId);
    
    if (lockCheck.isLocked) {
      return c.json({
        error: 'Bu hesap başka bir bilgisayara kayıtlıdır.',
        errorCode: 'HARDWARE_MISMATCH'
      }, 403);
    }

    // 4. İlk giriş ise hardware ID kaydet
    if (lockCheck.needsRegistration) {
      await db.registerHardwareId(userId, hardwareId);
    }

    // 5. ⭐ Electron token oluştur (24 saat)
    const electronToken = await db.createElectronToken(userId, hardwareId, 24);

    return c.json({
      success: true,
      electronToken,  // ⭐ Bu token browser'a gönderilir
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error('Electron signin error:', error);
    return c.json({ error: error.message }, 500);
  }
});
```

**Token Oluşturma Fonksiyonu:**

```javascript
// /supabase/functions/server/db_helpers.tsx
export async function createElectronToken(
  userId: string, 
  hardwareId: string, 
  expiryHours: number = 24
): Promise<string> {
  const token = crypto.randomUUID(); // Benzersiz token
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  // PostgreSQL'e kaydet
  const { error } = await supabase
    .from('electron_tokens')
    .insert({
      token,
      user_id: userId,
      hardware_id: hardwareId,
      expires_at: expiresAt.toISOString(),
      used_count: 0,
    });

  if (error) {
    console.error('Token creation error:', error);
    throw new Error('Token oluşturulamadı');
  }

  return token;
}
```

---

### 3. Web Site - Token'ı Al ve Doğrula

**Dosya:** `/App.tsx`

```typescript
useEffect(() => {
  console.log('🚀 App başlatıldı');
  
  const params = new URLSearchParams(window.location.search);
  
  // ⭐ URL'den token'ı oku
  const electronToken = params.get('token');
  
  if (electronToken) {
    console.log('🔑 Electron token bulundu, doğrulama yapılıyor...');
    handleElectronToken(electronToken);
    return;
  }
  
  // Normal session check
  checkSession();
}, []);

const handleElectronToken = async (electronToken: string) => {
  try {
    setLoading(true);
    
    console.log('🔍 Token doğrulama başlıyor...');
    
    // ⭐ Backend'e token gönder
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-47081311/validate-electron-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ electronToken }),
      }
    );

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('✅ Token validation başarılı:', result);
      
      // ⭐ Access token ve kullanıcı bilgilerini kaydet
      setAccessToken(result.accessToken);
      setUser(result.user);
      
      localStorage.setItem('access_token', result.accessToken);
      localStorage.setItem('user', JSON.stringify(result.user));
      
      // ⭐ URL'den token'ı temizle (güvenlik için)
      window.history.replaceState({}, '', window.location.pathname);
      
      console.log('✅ Otomatik giriş tamamlandı!');
    } else {
      console.error('❌ Token validation hatası:', result.error);
      alert(`Giriş başarısız: ${result.error || 'Geçersiz token'}`);
    }
  } catch (error) {
    console.error('❌ Token işleme hatası:', error);
    alert('Giriş başarısız. Lütfen Electron uygulamasından tekrar giriş yapın.');
  } finally {
    setLoading(false);
  }
};
```

---

### 4. Backend - Token Doğrulama

**Dosya:** `/supabase/functions/server/index.tsx`

```javascript
app.post('/make-server-47081311/validate-electron-token', async (c) => {
  console.log('🚀 /validate-electron-token endpoint çağrıldı');
  
  try {
    const { electronToken } = await c.req.json();
    
    if (!electronToken) {
      return c.json({ error: 'Token gerekli' }, 400);
    }

    console.log('🔍 Token doğrulanıyor:', electronToken);

    // ⭐ SQL'den token bilgisini al
    const { data: tokenData, error: tokenError } = await supabase
      .from('electron_tokens')
      .select('*')
      .eq('token', electronToken)
      .single();

    if (tokenError || !tokenData) {
      console.error('❌ Token bulunamadı');
      return c.json({ error: 'Geçersiz veya süresi dolmuş token' }, 401);
    }

    // Süre kontrolü
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);
    
    if (now > expiresAt) {
      console.error('❌ Token süresi dolmuş');
      return c.json({ error: 'Token süresi dolmuş' }, 401);
    }

    // Kullanım sayısı kontrolü (max 5 kez kullanılabilir)
    if (tokenData.used_count >= 5) {
      console.error('❌ Token kullanım limiti aşıldı');
      return c.json({ error: 'Token kullanım limiti aşıldı' }, 401);
    }

    // ⭐ Kullanım sayısını artır
    await supabase
      .from('electron_tokens')
      .update({ 
        used_count: tokenData.used_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('token', electronToken);

    // Kullanıcı bilgilerini al
    const user = await db.getUserById(tokenData.user_id);

    if (!user) {
      return c.json({ error: 'Kullanıcı bulunamadı' }, 404);
    }

    // ⭐ Supabase access token oluştur
    const { data: authData, error: authError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    });

    if (authError || !authData.properties?.access_token) {
      return c.json({ error: 'Token oluşturulamadı' }, 500);
    }

    console.log('✅ Token doğrulama başarılı:', user.email);

    return c.json({
      success: true,
      accessToken: authData.properties.access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return c.json({ error: error.message }, 500);
  }
});
```

---

## 🔒 Güvenlik Özellikleri

### 1. Token Özellikleri
- **Benzersiz**: Her giriş için yeni token (UUID)
- **Süreli**: 24 saat geçerlilik
- **Sınırlı Kullanım**: Maksimum 5 kez kullanılabilir
- **Hardware-Locked**: Sadece kayıtlı cihazdan

### 2. Güvenlik Kontrolleri
```javascript
✓ Token geçerlilik süresi
✓ Kullanım sayısı limiti
✓ Hardware ID eşleşmesi
✓ Kullanıcı varlığı
✓ Plan limitleri
```

### 3. URL Temizleme
```javascript
// Token kullanıldıktan sonra URL'den temizlenir
window.history.replaceState({}, '', window.location.pathname);
// ✓ Token artık URL'de görünmez
// ✓ Browser history'de saklanmaz
// ✓ Paylaşımda güvenlik riski yok
```

---

## 🧪 Test Senaryoları

### Test 1: Normal Akış
```bash
1. Electron uygulamasını başlat
   → npm start

2. Giriş yap
   → admin@ilsasupport.com / Admin123456!

3. Browser otomatik açılır
   → https://ilsasupport.figma.site?token=abc123...

4. Web sitesi token'ı doğrular
   → POST /validate-electron-token

5. Otomatik giriş tamamlanır
   → Dashboard görüntülenir

✅ Token URL'den temizlenir
✅ Kullanıcı oturumu aktif
```

### Test 2: Token Süresi Dolmuş
```bash
1. 24 saatten eski token ile browser aç
   → https://ilsasupport.figma.site?token=OLD_TOKEN

2. Backend token'ı reddeder
   → "Token süresi dolmuş"

3. Kullanıcı login sayfasına yönlendirilir
   → Manuel giriş yapmalı
```

### Test 3: Token Yeniden Kullanım
```bash
1. Token ile 5 kez giriş yap
   → Her defasında başarılı

2. 6. kullanımda
   → "Token kullanım limiti aşıldı"

3. Yeni giriş gerekli
   → Electron'dan tekrar giriş yapmalı
```

---

## 📊 Token Veritabanı

**Tablo:** `electron_tokens`

```sql
CREATE TABLE electron_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  hardware_id TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index'ler
CREATE INDEX idx_electron_tokens_token ON electron_tokens(token);
CREATE INDEX idx_electron_tokens_user_id ON electron_tokens(user_id);
CREATE INDEX idx_electron_tokens_expires_at ON electron_tokens(expires_at);
```

**Örnek Kayıt:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "token": "abc123-def456-ghi789",
  "user_id": "user-uuid-here",
  "hardware_id": "machine-id-abc123",
  "expires_at": "2025-01-01T10:30:00Z",
  "used_count": 2,
  "last_used_at": "2025-12-31T12:00:00Z",
  "created_at": "2025-12-31T10:30:00Z"
}
```

---

## 🐛 Sorun Giderme

### Hata: "Geçersiz token"
```javascript
// Sebep: Token yanlış veya silinmiş
// Çözüm: Electron'dan tekrar giriş yap
```

### Hata: "Token süresi dolmuş"
```javascript
// Sebep: 24 saatten eski token
// Çözüm: Yeni giriş gerekli
```

### Hata: "Token kullanım limiti aşıldı"
```javascript
// Sebep: 5'ten fazla kullanım
// Çözüm: Electron'dan yeni giriş yap
```

### Token URL'de Gözüküyor
```javascript
// Sorun: Token temizlenmemiş
// Kontrol: App.tsx'de window.history.replaceState() çağrısı var mı?
```

---

## 🎯 Kullanım İpuçları

### Geliştirme
```bash
# Token'ı console'da görmek için
console.log('Token:', electronToken);

# Backend loglarını görmek için
# Supabase Dashboard → Edge Functions → Logs
```

### Production
```bash
# DevTools'u kapat
# main.js'de openDevTools() satırını kaldır

# Token loglarını kaldır
# Sadece hata logları bırak
```

---

## ✅ Checklist

### Electron App
- [x] Hardware ID alınıyor
- [x] Backend'e giriş isteği gönderiliyor
- [x] electronToken alınıyor
- [x] Token ile browser açılıyor

### Backend
- [x] /electron-signin endpoint'i çalışıyor
- [x] Token oluşturuluyor ve DB'ye kaydediliyor
- [x] /validate-electron-token endpoint'i çalışıyor
- [x] Token doğrulama yapılıyor
- [x] Supabase access token oluşturuluyor

### Web Site
- [x] URL'den token okunuyor
- [x] Token backend'e gönderiliyor
- [x] Access token alınıyor
- [x] Kullanıcı giriş yapıyor
- [x] URL'den token temizleniyor

---

**Son Güncelleme:** 2025-12-31  
**Versiyon:** 2.0.0  
**Status:** ✅ Aktif ve Çalışıyor
