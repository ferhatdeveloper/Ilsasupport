# 🛠️ ILSA Support - Uzaktan Destek Sistemi

## 🎯 Genel Bakış

ILSA Support platformu, kullanıcılara uzaktan teknik destek sağlamak için güvenli bir sistem sunar. Sistem, izin tabanlı erişim kontrolü ile çalışır ve tüm işlemler loglanır.

---

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                    UZAKTAN DESTEK MİMARİSİ                  │
└─────────────────────────────────────────────────────────────┘

[Kullanıcı PC]                    [Backend]                [Destek Ekibi]
     │                                │                          │
     │  1. Destek ID al              │                          │
     │─────────────────────────────>│                          │
     │  (ILSA-A1B2C3D4)              │                          │
     │                                │                          │
     │                                │  2. Bağlantı talebi     │
     │                                │<─────────────────────────│
     │                                │                          │
     │  3. Onay dialogu              │                          │
     │<─────────────────────────────│                          │
     │                                │                          │
     │  4. İzin ver                  │                          │
     │─────────────────────────────>│                          │
     │                                │                          │
     │                                │  5. Session oluştur     │
     │                                │─────────────────────────>│
     │                                │                          │
     │  6. Uzaktan bağlantı          │                          │
     │<───────────────────────────────────────────────────────>│
     │                                │                          │
```

---

## 📋 Özellikler

### ✅ Kullanıcı Tarafı
- **Benzersiz Destek ID**: Her kullanıcı için otomatik oluşturulur
- **İzin Sistemi**: Kullanıcı onayı olmadan erişim yok
- **Görsel Durum**: Bağlantı durumu anlık gösterilir
- **Kolay Paylaşım**: ID tek tıkla kopyalanır
- **Güvenli**: Tüm işlemler şifreli

### ✅ Destek Ekibi Tarafı
- **API Tabanlı**: RESTful API ile kolay entegrasyon
- **Session Yönetimi**: Aktif oturumları takip et
- **Log Sistemi**: Tüm işlemler kaydedilir
- **Çoklu Kullanıcı**: Aynı anda birden fazla destek
- **Timeout**: Otomatik oturum sonlandırma

---

## 🚀 Hızlı Başlangıç

### Kullanıcı: Destek ID Alma

1. **Electron uygulamasını aç**
2. **Giriş yap**
3. **"Uzaktan Destek Talebi" butonuna tıkla**
4. **Destek ID'yi kopyala**

Örnek ID: `ILSA-A1B2C3D4`

### Destek Ekibi: Bağlantı Kurma

#### Adım 1: Destek Talebi Gönder

```bash
curl -X POST \
  https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/request-support \
  -H "Content-Type: application/json" \
  -d '{
    "supportId": "ILSA-A1B2C3D4",
    "supporterName": "Ahmet Yılmaz"
  }'
```

**Cevap:**
```json
{
  "success": true,
  "requestId": "abc-123-def-456",
  "message": "Destek talebi gönderildi, kullanıcı onayı bekleniyor",
  "supportId": "ILSA-A1B2C3D4"
}
```

#### Adım 2: Kullanıcı Onayını Kontrol Et

```bash
curl "https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/check-support-request?supportId=ILSA-A1B2C3D4"
```

**Onay Bekliyor:**
```json
{
  "success": true,
  "hasRequest": true,
  "request": {
    "requestId": "abc-123-def-456",
    "supporterName": "Ahmet Yılmaz",
    "status": "pending",
    "createdAt": "2025-12-31T10:30:00Z"
  }
}
```

**Onaylandı:**
```json
{
  "success": true,
  "hasRequest": true,
  "request": {
    "requestId": "abc-123-def-456",
    "supporterName": "Ahmet Yılmaz",
    "status": "approved",
    "sessionId": "xyz-789",
    "createdAt": "2025-12-31T10:30:00Z"
  }
}
```

#### Adım 3: Session Kontrolü

```bash
curl "https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/check-support-session?sessionId=xyz-789"
```

**Cevap:**
```json
{
  "success": true,
  "active": true,
  "session": {
    "sessionId": "xyz-789",
    "supportId": "ILSA-A1B2C3D4",
    "status": "active",
    "startedAt": "2025-12-31T10:35:00Z"
  }
}
```

#### Adım 4: Session Sonlandır

```bash
curl -X POST \
  https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/end-support-session \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "xyz-789"
  }'
```

---

## 🔌 API Endpoints

### 1. Destek ID Al
```
GET /make-server-47081311/get-support-id
Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "success": true,
  "supportId": "ILSA-A1B2C3D4",
  "userId": "abc-123-def",
  "email": "user@example.com",
  "name": "John Doe"
}
```

---

### 2. Destek Talebi Gönder
```
POST /make-server-47081311/request-support
Content-Type: application/json

{
  "supportId": "ILSA-A1B2C3D4",
  "supporterName": "Ahmet Yılmaz"
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "abc-123-def-456",
  "message": "Destek talebi gönderildi, kullanıcı onayı bekleniyor",
  "supportId": "ILSA-A1B2C3D4"
}
```

---

### 3. Talep Durumunu Kontrol Et
```
GET /make-server-47081311/check-support-request?supportId=ILSA-A1B2C3D4
```

**Response (Pending):**
```json
{
  "success": true,
  "hasRequest": true,
  "request": {
    "requestId": "abc-123-def-456",
    "supporterName": "Ahmet Yılmaz",
    "status": "pending"
  }
}
```

**Response (Approved):**
```json
{
  "success": true,
  "hasRequest": true,
  "request": {
    "requestId": "abc-123-def-456",
    "status": "approved",
    "sessionId": "xyz-789"
  }
}
```

---

### 4. Session Kontrolü
```
GET /make-server-47081311/check-support-session?sessionId=xyz-789
```

**Response:**
```json
{
  "success": true,
  "active": true,
  "session": {
    "sessionId": "xyz-789",
    "supportId": "ILSA-A1B2C3D4",
    "status": "active",
    "startedAt": "2025-12-31T10:35:00Z"
  }
}
```

---

### 5. Session Sonlandır
```
POST /make-server-47081311/end-support-session
Content-Type: application/json

{
  "sessionId": "xyz-789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Destek oturumu sonlandırıldı"
}
```

---

## 🔒 Güvenlik

### Kullanıcı Onayı
- Her bağlantı talebi için kullanıcı onayı zorunludur
- Onay dialogu kullanıcının ekranına gelir
- Reddetme hakkı her zaman saklıdır

### Session Yönetimi
- Sessionlar 2 saat sonra otomatik sona erer
- Kullanıcı istediği zaman sonlandırabilir
- Tek bir support ID için tek session

### Loglama
- Tüm destek talepleri loglanır
- IP adresleri kaydedilir
- Timestamp bilgisi tutulur
- GDPR uyumlu

### Rate Limiting
- Destek talebi: Dakikada 5 istek
- Session kontrolü: Dakikada 60 istek
- Aşırı istekler engellenir

---

## 🧪 Test Senaryoları

### Test 1: Başarılı Destek Bağlantısı
```bash
# 1. Kullanıcı ID alır
SUPPORT_ID="ILSA-12345678"

# 2. Destek ekibi talep gönderir
curl -X POST .../request-support -d '{"supportId":"'$SUPPORT_ID'"}'

# 3. Kullanıcı onaylar (Electron UI'dan)

# 4. Destek ekibi polling yapar
curl ".../check-support-request?supportId=$SUPPORT_ID"

# 5. Onay gelince session başlar
```

### Test 2: Reddedilen Talep
```bash
# 1. Talep gönder
curl -X POST .../request-support -d '{"supportId":"ILSA-12345678"}'

# 2. Kullanıcı reddeder (Electron UI'dan)

# 3. Status "rejected" gelir
curl ".../check-support-request?supportId=ILSA-12345678"
# -> { "status": "rejected" }
```

### Test 3: Timeout
```bash
# 1. Session başlat
# 2. 2 saat bekle
# 3. Session otomatik sona erer
curl ".../check-support-session?sessionId=xyz"
# -> { "active": false }
```

---

## 🛠️ Kurulum

### Backend (Zaten Hazır)
Backend'de uzaktan destek endpoint'leri zaten eklenmiştir:
- `/get-support-id`
- `/request-support`
- `/check-support-request`
- `/respond-support-request`
- `/check-support-session`
- `/end-support-session`

### Electron App (Yeni Yapı)
```bash
cd electron-app
npm install
npm start
```

Detaylı kurulum: `/electron-app/README.md`

---

## 📊 Durum Kodları

| Durum | Açıklama |
|-------|----------|
| `pending` | Kullanıcı onayı bekleniyor |
| `approved` | Onaylandı, session oluşturuldu |
| `rejected` | Kullanıcı reddetti |
| `active` | Session aktif |
| `expired` | Session süresi doldu |
| `closed` | Session manuel olarak kapatıldı |

---

## 🔄 Polling Stratejisi

Destek ekibi kullanıcı onayını beklerken polling yapmalı:

```javascript
async function waitForApproval(supportId) {
  const maxAttempts = 60; // 5 dakika (5 saniyede bir kontrol)
  
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${API_URL}/check-support-request?supportId=${supportId}`
    );
    const data = await response.json();
    
    if (data.request?.status === 'approved') {
      return data.request.sessionId;
    }
    
    if (data.request?.status === 'rejected') {
      throw new Error('Kullanıcı talebi reddetti');
    }
    
    // 5 saniye bekle
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Timeout: Kullanıcı yanıt vermedi');
}
```

---

## 🎯 Gelecek Özellikler

- [ ] WebRTC ile peer-to-peer bağlantı
- [ ] Ekran paylaşımı (built-in)
- [ ] VNC/RDP tam entegrasyonu
- [ ] Ses/video chat
- [ ] Dosya transfer
- [ ] Web panel (destek ekibi için)
- [ ] Mobil app desteği
- [ ] Çoklu destek ekibi üyesi
- [ ] Session kayıt/tekrar oynatma
- [ ] Analytics ve raporlama

---

## 📞 Destek

### Dokümantasyon
- **Electron App**: `/electron-app/README.md`
- **Hızlı Başlangıç**: `/electron-app/QUICKSTART.md`
- **Backend API**: `/supabase/functions/server/index.tsx`

### API Test
```bash
# Postman Collection
# Import: ilsa-support-api.postman_collection.json
```

### Issues
- GitHub Issues
- Email: support@ilsasupport.com

---

**Son Güncelleme:** 2025-12-31  
**Versiyon:** 2.0.0  
**Status:** ✅ Production Ready
