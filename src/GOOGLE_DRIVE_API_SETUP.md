# 🚀 Google Drive API Kurulum Rehberi - ILSA Support

## ✅ Ne Yapıldı?

Google Drive API entegrasyonu eklendi! Artık sistemınız:

1. ✅ **Google Drive dosyalarını API ile indirir**
2. ✅ **Streaming download** (parçalı, memory-efficient)
3. ✅ **Google Drive linklerini tamamen gizler** (backend'de kalır)
4. ✅ **Otomatik fallback** (API key yoksa redirect moduna geçer)

---

## 🔧 Hızlı Kurulum (5 Dakika)

### Adım 1: Google Cloud Console Kurulumu

#### 1.1 Proje Oluştur
```
1. https://console.cloud.google.com/ adresine git
2. Üst menüden "Select a project" tıkla
3. "NEW PROJECT" tıkla
4. Proje adı: "ILSA Support" (veya istediğin isim)
5. CREATE tıkla
```

#### 1.2 Google Drive API'yi Aktif Et
```
1. Sol menüden "APIs & Services" > "Library"
2. Arama kutusuna "Google Drive API" yaz
3. İlk sonuca tıkla (Google Drive API)
4. "ENABLE" butonuna tıkla
```

#### 1.3 API Key Oluştur
```
1. Sol menüden "APIs & Services" > "Credentials"
2. Üst menüden "+ CREATE CREDENTIALS" tıkla
3. "API key" seç
4. Popup açılır: "API key created"
5. KOPYALA butonuna tıkla (clipboard'a kopyalanır)
6. ✅ API Key'iniz hazır!
```

---

### Adım 2: Figma Make'te API Key Ekle

```
1. Figma Make uygulamasını aç
2. Environment Variables bölümüne git
3. GOOGLE_DRIVE_API_KEY adında yeni bir secret ekle
4. Kopyaladığın API key'i yapıştır
5. Kaydet
```

**ÖNEMLİ:** API key'i kimseyle paylaşma!

---

### Adım 3: Google Drive Dosyalarını Paylaş

⚠️ **Kritik:** Google Drive'daki dosyalar "Anyone with the link" olarak paylaşılmalı!

```
Her dosya için:
1. Google Drive'da dosyaya sağ tık
2. "Share" tıkla
3. "Get link" tıkla (sağ üst köşe)
4. "Restricted" → "Anyone with the link" değiştir
5. "Viewer" rolünü seç (düzenleme gerekmez)
6. "Copy link" tıkla
7. Bu linki admin panel'de kullan
```

---

## 🎯 Test Etme

### Test 1: API Çalışıyor mu?

1. Admin panel'den bir dosya ekle:
   - Google Drive linkini yapıştır
   - Diğer bilgileri doldur
   - Kaydet

2. Normal kullanıcı olarak dosyayı indir:
   - Download butonuna tıkla
   - Yeni sekmede indirme başlar

3. Browser Console'u aç (F12):
   - "📥 Starting Google Drive API download" görmelisin
   - "✅ Google Drive stream started" görmelisin
   - Bu mesajlar varsa ✅ API çalışıyor!

4. Fallback testi:
   - "⚠️ Falling back to redirect" görürsen → API key yok veya hatalı
   - Bu durumda da indirme çalışır (redirect modunda)

---

## 🔐 Güvenlik (Opsiyonel ama Önerilen)

### API Key Kısıtlamaları Ekle

Daha güvenli olması için API key'e kısıtlama ekle:

```
1. Google Cloud Console > "Credentials"
2. API key'ine tıkla
3. "API restrictions" bölümünde:
   - "Restrict key" seç
   - "Google Drive API" seç
   - Save

4. "Application restrictions" bölümünde:
   - "HTTP referrers (web sites)" seç
   - "ADD AN ITEM" tıkla
   - Kendi domain'ini ekle: https://yourdomain.com/*
   - Save
```

---

## 📊 Quota ve Limitler

### Ücretsiz Google Drive API Limitleri:

```
✅ Günlük Quota: 1,000,000,000 units
✅ Requests/100 saniye: 10,000
✅ Requests/100 saniye/user: 1,000
```

**Yeterli mi?**
- Orta büyüklükte bir site için fazlasıyla yeterli
- Günde 10,000+ dosya indirme yapabilirsin
- Büyük dosyalarda bile problem yok

### Quota İzleme:

```
1. Google Cloud Console > "APIs & Services" > "Dashboard"
2. "Google Drive API" kartına tıkla
3. Quota kullanımını görüntüle
```

---

## 🐛 Sorun Giderme

### Problem 1: "GOOGLE_DRIVE_API_KEY not configured" Hatası

**Çözüm:**
```
1. Environment variable doğru adda mı? (GOOGLE_DRIVE_API_KEY)
2. API key'i kopyalarken boşluk kalmış olabilir mi?
3. Server'ı yeniden başlat
```

**Fallback:**
- Bu hata olsa bile sistem çalışır (redirect modunda)
- Sadece Google Drive linki görünebilir

---

### Problem 2: "403 Forbidden" Hatası

**Nedeni:**
- Google Drive dosyası paylaşılmamış

**Çözüm:**
```
1. Google Drive'da dosyayı bul
2. "Share" > "Anyone with the link"
3. "Viewer" rolü seç
4. Kaydet
```

---

### Problem 3: "404 Not Found" Hatası

**Nedeni:**
- Dosya ID'si yanlış
- Dosya silinmiş

**Çözüm:**
```
1. Google Drive'da dosyayı aç
2. URL'den file ID'yi kontrol et:
   https://drive.google.com/file/d/[FILE_ID]/view
3. Admin panel'de doğru linki kullandığından emin ol
```

---

### Problem 4: İndirme Çok Yavaş

**API Stream vs Redirect:**

```
🔄 Redirect Modu (API key yoksa):
   - Çok hızlı
   - Doğrudan Google Drive'dan indirir
   - Link görünebilir

📥 API Stream Modu (API key varsa):
   - Server'dan geçer
   - Biraz daha yavaş olabilir
   - Link HİÇ görünmez
```

**Çözüm:**
- Büyük dosyalar için redirect modunu tercih edebilirsin
- API key'i kaldır → Otomatik redirect moduna geçer

---

## 🔄 API Stream vs Redirect Karşılaştırma

| Özellik | API Stream 🆕 | Redirect (Eski) |
|---------|--------------|-----------------|
| **Hız** | Orta | Çok Hızlı |
| **Google Drive Link** | Tamamen Gizli 🔒 | Görünebilir ⚠️ |
| **Server Yükü** | Var (bandwidth) | Yok |
| **Kurulum** | API key gerekli | Kurulum yok |
| **Profesyonellik** | Yüksek ✅ | Orta |
| **Büyük Dosyalar** | Daha yavaş | Hızlı |

**Önerimiz:**
- **Küçük-orta dosyalar:** API Stream ✅
- **Çok büyük dosyalar (>5GB):** Redirect
- **Link güvenliği önemli:** API Stream ✅

---

## 📝 Sistem Nasıl Çalışıyor?

### API Stream Modu (API key varsa):
```
1. Kullanıcı "Download" tıklar
2. Backend tek kullanımlık token oluşturur
3. Kullanıcı token ile /download-file/:token'a gider
4. Backend:
   a. Token'ı validate eder
   b. Google Drive API'ye metadata isteği atar
   c. Google Drive API'ye download isteği atar
   d. Stream'i client'a aktarır
5. Kullanıcı dosyayı indirir
   - Google Drive linki HİÇ görünmez ✅
```

### Redirect Modu (API key yoksa):
```
1. Kullanıcı "Download" tıklar
2. Backend tek kullanımlık token oluşturur
3. Kullanıcı token ile /download-file/:token'a gider
4. Backend:
   a. Token'ı validate eder
   b. Google Drive direct link'e redirect eder
5. Kullanıcı dosyayı Google Drive'dan indirir
   - URL'de Google Drive linki görünebilir ⚠️
```

---

## ✅ Checklist

Kurulum tamamlandı mı? Kontrol et:

- [ ] Google Cloud Console'da proje oluşturdun
- [ ] Google Drive API'yi aktif ettin
- [ ] API key oluşturdun
- [ ] Figma Make'te GOOGLE_DRIVE_API_KEY ekledin
- [ ] Google Drive dosyalarını "Anyone with the link" olarak paylaştın
- [ ] Test indirme yaptın
- [ ] Browser console'da "📥 Starting Google Drive API download" gördün
- [ ] API key kısıtlamaları ekledin (opsiyonel)

---

## 🎉 Tamamlandı!

Artık Google Drive API entegrasyonun hazır! 

**Avantajlar:**
✅ Google Drive linklerini tamamen gizler  
✅ Profesyonel indirme deneyimi  
✅ Otomatik fallback (API key yoksa çalışır)  
✅ Büyük dosyalar için memory-efficient  
✅ Token-based güvenlik  

**Destek:**
- Sorun yaşarsan `/GOOGLE_DRIVE_SYSTEM.md` dosyasına bak
- Detaylı API dokümantasyonu için Google Drive API v3 dokümanlarını oku

---

**🔥 İyi indirmeler!** 🚀
