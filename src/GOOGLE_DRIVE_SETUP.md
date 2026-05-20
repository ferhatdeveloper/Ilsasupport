# 🔧 Google Drive API Kurulum Rehberi

## ❌ Sorun: "Requests from referer <empty> are blocked"

Bu hata, Google Drive API key'iniz **HTTP referrer kısıtlamasına** sahip olduğunda ortaya çıkar. Supabase Edge Functions (backend) referer göndermediği için istek engellenir.

### 🔴 Hata Mesajı:
```json
{
  "error": {
    "code": 403,
    "message": "Requests from referer <empty> are blocked.",
    "reason": "API_KEY_HTTP_REFERRER_BLOCKED"
  }
}
```

---

## ✅ Çözüm 1: API Key Kısıtlamasını Kaldır (Önerilen)

### Adımlar:

1. **Google Cloud Console'a git:**
   - https://console.cloud.google.com/

2. **API & Services > Credentials:**
   - Sol menüden "APIs & Services" > "Credentials"

3. **API Key'i seç:**
   - Kullandığınız API key'e tıklayın

4. **Application restrictions:**
   - **"None"** seçin
   - VEYA **"HTTP referrers (web sites)"** seçip şu domain'leri ekleyin:
     ```
     *.supabase.co/*
     https://rleiiezkvhrzmbccqock.supabase.co/*
     ```

5. **API restrictions:**
   - "Google Drive API" seçili olduğundan emin olun

6. **Save** tıklayın

---

## ✅ Çözüm 2: Dosyaları Public Yap

Eğer API key'i düzeltemiyorsanız, dosyaları public yapın:

1. **Google Drive'da dosyaya sağ tıklayın**

2. **"Share" > "Get link"**

3. **"Anyone with the link"** seçin

4. **Role: "Viewer"**

5. **"Copy link"** ve sisteme ekleyin

---

## 🚀 Sistem Nasıl Çalışıyor?

Sistem **2 farklı yöntem** kullanarak Google Drive'dan indirme yapar:

### **Method 1: Direct Download** (Öncelikli)
```
https://drive.google.com/uc?export=download&id=FILE_ID&confirm=t
```
- ✅ API key gerektirmez
- ✅ Public dosyalar için çalışır
- ✅ Referrer kısıtlaması yok

### **Method 2: Google Drive API** (Fallback)
```
https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media&key=API_KEY
```
- ❌ API key gerektirir
- ❌ Referrer kısıtlamasına takılabilir
- ✅ Daha güvenli (izinleri kontrol eder)

---

## 🔐 Güvenlik Notları

- **API Key** backend'de (Supabase Edge Function) kullanılır, frontend'e expose olmaz
- Dosyalar **public** ise herkes indirebilir
- Dosyalar **private** ise OAuth2 service account gerekir

---

## 🧪 Test

1. Dosyayı "Anyone with the link" olarak paylaşın
2. Download butonuna tıklayın
3. Backend loglarını kontrol edin:

```
📥 Google Drive indirme başlatılıyor: 1dpi9eAX2yQYpQogY5N2eD3z921kUwan_
🔄 Method 1: Direct download link deneniyor...
✅ Direct download başarılı: firmware.bin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Eğer Method 1 başarısız olursa:
```
⚠️ Direct download başarısız (403), API deneniyor...
🔄 Method 2: Google Drive API deneniyor...
✅ Google Drive API başarılı: firmware.bin
```

---

## 📞 Sorun Devam Ediyorsa

1. **Dosyanın public olduğundan emin olun**
2. **API key kısıtlamalarını kontrol edin**
3. **Browser console'u açın ve hata mesajlarını okuyun**
4. **Backend loglarını kontrol edin** (Supabase Dashboard > Edge Functions > Logs)

---

## 🎯 Production Önerileri

1. **OAuth2 Service Account kullanın** (en güvenli)
2. **Dosyaları Supabase Storage'a taşıyın** (Google Drive yerine)
3. **CDN kullanın** (büyük dosyalar için)

---

**Son Güncelleme:** 31 Aralık 2024
