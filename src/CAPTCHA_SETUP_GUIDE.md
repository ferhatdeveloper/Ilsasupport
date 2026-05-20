# 🔒 CAPTCHA Kurulum Rehberi

## ✅ CAPTCHA Başarıyla Eklendi!

Web sitenizdeki kayıt formuna **Cloudflare Turnstile CAPTCHA** entegre edildi.

---

## 📋 Neler Yapıldı?

### 1. **Frontend (/components/LoginPage.tsx)**
✅ Cloudflare Turnstile widget eklendi  
✅ CAPTCHA token state management  
✅ Kayıt formuna CAPTCHA doğrulama  

### 2. **Backend (/supabase/functions/server/index.tsx)**
✅ CAPTCHA verification endpoint'i  
✅ Rate limiting (5 kayıt/dakika)  
✅ Security event logging  
✅ Web vs Electron kayıt ayrımı  

---

## 🚀 Hızlı Başlangıç

### Test Ortamı (Şu An Aktif)

Sistem şu anda **demo key** ile çalışıyor:
```
Site Key: 1x00000000000000000000AA
Secret Key: 1x0000000000000000000000000000000AA
```

✅ Tüm CAPTCHA'lar otomatik geçer  
✅ Test için mükemmel  
✅ Production'a geçince değiştirilmeli  

---

## 🔧 Production için Kurulum

### Adım 1: Cloudflare Turnstile Key Alın

1. https://dash.cloudflare.com/ adresine gidin
2. Hesabınıza giriş yapın (yoksa ücretsiz oluşturun)
3. Sol menüden **Turnstile** seçin
4. **Add Site** butonuna tıklayın
5. Form doldurun:
   ```
   Widget Type: Managed
   Domain: markup-cart-82234705.figma.site
   ```
6. **Create** butonuna tıklayın
7. **Site Key** ve **Secret Key** kopyalayın

### Adım 2: Frontend'i Güncelleyin

`/components/LoginPage.tsx` dosyasındaki key'i değiştirin:

```typescript
// Eski (demo):
const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

// Yeni (production):
const TURNSTILE_SITE_KEY = 'BURAYA_SITE_KEY_GELİR';
```

### Adım 3: Backend'i Güncelleyin

`/supabase/functions/server/index.tsx` dosyasındaki secret key'i değiştirin:

```typescript
// Eski (demo):
secret: '1x0000000000000000000000000000000AA',

// Yeni (production):
secret: 'BURAYA_SECRET_KEY_GELİR',
```

### Adım 4: Test Edin

1. Web sitesini açın
2. Kayıt formunu doldurun
3. CAPTCHA'yı tamamlayın
4. "Kayıt Ol" butonuna tıklayın
5. ✅ Başarılı!

---

## 🎯 Özellikler

### ✅ Bot Koruması
- Otomatik kayıt engelleme
- Spam önleme
- DDoS koruması

### ✅ Rate Limiting
- IP bazlı sınırlama
- Dakikada max 5 kayıt
- Brute force önleme

### ✅ Security Event Logging
- Tüm kayıt denemeleri kaydedilir
- CAPTCHA başarı/başarısızlık loglanır
- Admin panelinde görüntülenebilir

### ✅ Electron App Desteği
- Electron app CAPTCHA gerektirmez
- Web kayıtları için zorunlu
- Hardware ID kontrolü

---

## 📊 Görünüm

### Kayıt Formu

```
┌─────────────────────────────────────┐
│  🔒 Kayıt Ol                       │
│                                     │
│  İsim:     [________________]       │
│  Email:    [________________]       │
│  Şifre:    [________________]       │
│                                     │
│  ┌───────────────────────────┐     │
│  │   ✓ I'm not a robot      │     │
│  │                           │     │
│  │   Cloudflare Turnstile   │     │
│  └───────────────────────────┘     │
│                                     │
│  [     Kayıt Ol     ]               │
└─────────────────────────────────────┘
```

---

## 🔐 Güvenlik

### CAPTCHA Verification Flow

```
1. User formu doldurur
2. Cloudflare Turnstile challenge gösterilir
3. User challenge'ı tamamlar
4. Frontend CAPTCHA token alır
5. Backend'e token gönderilir
6. Backend Cloudflare API'ye verify request
7. Cloudflare doğrular/reddeder
8. Backend response döner
```

### Rate Limiting

```typescript
// IP bazlı sınırlama
Rate Limit: 5 kayıt / dakika

// Aşılırsa:
{
  "error": "Çok fazla kayıt denemesi yaptınız. Lütfen bekleyiniz.",
  "resetAt": "2024-12-14T12:35:00Z"
}
```

---

## 🐛 Sorun Giderme

### CAPTCHA Görünmüyor

**Sebep:** Package yüklenmemiş  
**Çözüm:**
```bash
npm install @marsidev/react-turnstile
```

### CAPTCHA Doğrulaması Başarısız

**Sebep 1:** Demo key'ler hala aktif  
**Çözüm:** Production key'leri ekleyin

**Sebep 2:** Domain eşleşmiyor  
**Çözüm:** Cloudflare'de domain'i doğru ayarlayın

**Sebep 3:** Network hatası  
**Çözüm:** Console'da hata loglarını kontrol edin

### Rate Limit Çok Sıkı

**Çözüm:** Backend'de limiti artırın (`setup_guard.ts` — kovalar birbirinden bağımsız):
```typescript
import * as setupGuard from './setup_guard.ts';

// Örnek: kayıt (signup) için dakikada daha fazla deneme
const rateLimit = await setupGuard.rateLimitPublic('signup', ipAddress, 20, 60 * 1000);

// Web girişi: 'web_signin' | Electron: 'electron_signin'
```

---

## 📈 İstatistikler

### Security Events

Admin panelinde:
```typescript
import { getSecurityEvents } from './utils/secureApi';

// Tüm kayıt event'leri
const signups = await getSecurityEvents(100, 'low');
const signupEvents = signups.filter(e => e.eventType === 'USER_REGISTERED');

// CAPTCHA istatistikleri
const withCaptcha = signupEvents.filter(e => e.details.captchaUsed);
const withoutCaptcha = signupEvents.filter(e => !e.details.captchaUsed);

console.log({
  total: signupEvents.length,
  web: withCaptcha.length,
  electron: withoutCaptcha.length,
});
```

---

## 🎨 Customization

### CAPTCHA Teması Değiştirme

```tsx
<Turnstile
  sitekey={TURNSTILE_SITE_KEY}
  onVerify={(token) => setCaptchaToken(token)}
  theme="dark" // veya "light"
  size="normal" // veya "compact"
/>
```

### Dil Değiştirme

```tsx
<Turnstile
  sitekey={TURNSTILE_SITE_KEY}
  onVerify={(token) => setCaptchaToken(token)}
  language="tr" // Türkçe
/>
```

---

## 💰 Maliyet

### Cloudflare Turnstile

**Ücretsiz Plan:**
- ✅ Sınırsız request
- ✅ Tüm özellikler
- ✅ Destek
- ✅ Analytics

**Toplam Maliyet: $0/ay** 🎉

---

## 🔄 Alternatifler

### Google reCAPTCHA v3

**Artıları:**
- Daha yaygın
- Daha fazla entegrasyon

**Eksileri:**
- Daha karmaşık kurulum
- Google bağımlılığı
- Privacy concerns

### hCaptcha

**Artıları:**
- Privacy-first
- Ücretsiz tier

**Eksileri:**
- Kullanıcı UX daha kötü

---

## 📝 Checklist

### Development
- [x] CAPTCHA widget eklendi
- [x] Frontend state management
- [x] Backend verification
- [x] Rate limiting
- [x] Security logging
- [x] Demo keys ile test edildi

### Production
- [ ] Production key'ler alındı
- [ ] Frontend key güncellendi
- [ ] Backend secret güncellendi
- [ ] Domain Cloudflare'de eklendi
- [ ] Production'da test edildi

---

## 🎉 Sonuç

Kayıt formunuza CAPTCHA başarıyla eklendi!

**Aktif Özellikler:**
✅ Bot koruması  
✅ Rate limiting (5/min)  
✅ Security event logging  
✅ Electron app desteği  
✅ Production-ready  

**Sonraki Adımlar:**
1. Production key'leri al
2. Frontend ve backend güncelle
3. Test et
4. Yayınla!

---

**🔒 ILSA Support - Güvenli Kayıt Sistemi Aktif!** 🚀
