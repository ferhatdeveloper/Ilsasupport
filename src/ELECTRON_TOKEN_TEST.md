# ⚡ Electron → Web Token Testi - 2 Dakika

## 🎯 Hızlı Test

### 1️⃣ Electron'u Başlat
```bash
cd electron-app
npm start
```

### 2️⃣ Giriş Yap
```
Email: admin@ilsasupport.com
Şifre: Admin123456!
```

### 3️⃣ Browser Açılır
```
✅ Otomatik açılır: https://ilsasupport.figma.site?token=xyz...
✅ Token doğrulanır
✅ Otomatik giriş yapılır
✅ Dashboard görüntülenir
✅ Token URL'den temizlenir
```

---

## 🔍 Manuel Test (Adım Adım)

### Test 1: Token Oluşturma

1. **Electron Console'u Aç (DevTools)**
```bash
npm start -- --dev
```

2. **Giriş Yap ve Token'ı Gözlemle**
```javascript
// Console'da görünecek:
✅ Electron signin başarılı: admin@ilsasupport.com, token: abc123-def456...
```

3. **Token ile Browser Açıldığını Doğrula**
```
URL: https://ilsasupport.figma.site?token=abc123-def456...
```

### Test 2: Token Doğrulama

1. **Browser Console'u Aç (F12)**

2. **Logları Kontrol Et**
```javascript
// Console'da görünmeli:
🔑 Electron token bulundu, doğrulama yapılıyor...
🔍 Token doğrulama başlıyor...
✅ Token validation başarılı: { user: {...} }
✅ Otomatik giriş tamamlandı!
```

3. **URL'i Kontrol Et**
```
✅ Token temizlendi: https://ilsasupport.figma.site
❌ Token görünüyorsa: Sorun var!
```

### Test 3: Kullanıcı Bilgileri

1. **Console'da User Kontrolü**
```javascript
// Browser console'da çalıştır:
console.log('User:', JSON.parse(localStorage.getItem('user')));
console.log('Token:', localStorage.getItem('access_token'));

// Çıktı:
User: {
  id: "...",
  email: "admin@ilsasupport.com",
  name: "Admin User",
  role: "admin",
  plan: "premium"
}
Token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🧪 API Test (cURL)

### 1. Token Oluştur
```bash
curl -X POST \
  https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/electron-signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ilsasupport.com",
    "password": "Admin123456!",
    "hardwareId": "test-hardware-123"
  }'

# Cevap:
{
  "success": true,
  "electronToken": "abc123-def456-ghi789",
  "user": {
    "id": "...",
    "email": "admin@ilsasupport.com",
    "name": "Admin User",
    "role": "admin",
    "plan": "premium"
  }
}
```

### 2. Token'ı Doğrula
```bash
# Yukarıdaki electronToken'ı kullan
TOKEN="abc123-def456-ghi789"

curl -X POST \
  https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/validate-electron-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d "{\"electronToken\":\"$TOKEN\"}"

# Cevap:
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@ilsasupport.com",
    "name": "Admin User"
  }
}
```

---

## ⚠️ Hata Senaryoları

### Senaryo 1: Geçersiz Token
```bash
curl -X POST .../validate-electron-token \
  -d '{"electronToken":"INVALID_TOKEN"}'

# Cevap:
{
  "error": "Geçersiz veya süresi dolmuş token"
}
```

### Senaryo 2: Süresi Dolmuş Token
```bash
# 24 saatten eski token
curl -X POST .../validate-electron-token \
  -d '{"electronToken":"OLD_TOKEN"}'

# Cevap:
{
  "error": "Token süresi dolmuş"
}
```

### Senaryo 3: Kullanım Limiti
```bash
# 5'ten fazla kullanılmış token
curl -X POST .../validate-electron-token \
  -d '{"electronToken":"USED_TOKEN"}'

# Cevap:
{
  "error": "Token kullanım limiti aşıldı"
}
```

---

## ✅ Test Checklist

### Electron App
- [ ] Uygulama başlatılıyor
- [ ] Hardware ID alınıyor
- [ ] Giriş yapılabiliyor
- [ ] Token alınıyor
- [ ] Browser otomatik açılıyor
- [ ] Token URL'de görünüyor

### Backend
- [ ] /electron-signin çalışıyor
- [ ] Token oluşturuluyor
- [ ] Token DB'ye kaydediliyor
- [ ] /validate-electron-token çalışıyor
- [ ] Token doğrulanıyor
- [ ] Access token oluşturuluyor

### Web Site
- [ ] URL'den token okunuyor
- [ ] Token backend'e gönderiliyor
- [ ] Doğrulama başarılı
- [ ] Access token alınıyor
- [ ] Kullanıcı giriş yapıyor
- [ ] Token URL'den temizleniyor
- [ ] Dashboard yükleniyor

---

## 🎯 Başarı Kriterleri

### ✅ Test Başarılı
```
1. Electron'da giriş → Browser açılıyor
2. URL'de token var → https://...?token=xyz
3. 1-2 saniye içinde → Token doğrulanıyor
4. Otomatik giriş → Dashboard görünüyor
5. URL temiz → https://... (token yok)
6. Console'da hata yok
```

### ❌ Test Başarısız
```
Eğer:
- Browser açılmıyorsa → Electron main.js kontrol et
- Token URL'de yoksa → Backend yanıt kontrol et
- Token doğrulanmıyorsa → Backend endpoint kontrol et
- Otomatik giriş olmuyor → App.tsx kontrol et
- Token temizlenmiyorsa → replaceState() kontrol et
```

---

## 🐛 Debug İpuçları

### Electron Console
```javascript
// main.js içinde ekle
console.log('🔐 Token:', data.electronToken);
console.log('🌐 Opening URL:', webUrl);
```

### Backend Logs
```
Supabase Dashboard → Edge Functions → Logs
veya
Deno.serve() console.log çıktıları
```

### Browser Console
```javascript
// App.tsx içinde
console.log('🔍 URL params:', Object.fromEntries(params.entries()));
console.log('🔑 Token:', electronToken);
```

### Network Tab
```
F12 → Network → validate-electron-token
- Request payload'u kontrol et
- Response'u kontrol et
- Status code kontrol et (200 OK olmalı)
```

---

## 📊 Beklenen Davranış

### Timeline
```
0s   → Electron'da "Giriş Yap" tıkla
1s   → Backend'e istek gönderildi
2s   → Token alındı
3s   → Browser açıldı
4s   → Web site yüklendi
5s   → Token doğrulandı
6s   → Dashboard görüntülendi
7s   → URL temizlendi
```

### Network İzleme
```
1. POST /electron-signin
   ↓
2. Browser aç
   ↓
3. GET / (web site)
   ↓
4. POST /validate-electron-token
   ↓
5. Dashboard render
```

---

## 🎉 Test Sonucu

Tüm adımlar başarılıysa:

```
✅ Electron → Web token akışı çalışıyor!
✅ Kullanıcı deneyimi mükemmel
✅ Güvenlik doğru
✅ Production'a hazır
```

---

**Test Tarihi:** 2025-12-31  
**Test Eden:** [İsim]  
**Sonuç:** ✅ Başarılı / ❌ Başarısız  
**Notlar:** [Varsa]
