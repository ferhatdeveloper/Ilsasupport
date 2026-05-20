# ILSA Support — Masaüstü giriş

Minimal Electron uygulaması: giriş, cihaz kilidi, tarayıcıda siteyi açar.

## Kurulum

```powershell
cd C:\ilsasupport\electron-client
npm install
```

`config.json` adresleri kontrol edin:

```json
{
  "webUrl": "https://ilsasupport.com",
  "apiBase": "https://ilsasupport.com/make-server-47081311"
}
```

## Çalıştırma

```powershell
npm start
```

1. Kullanıcı adı + şifre
2. İlk girişte bu PC'nin donanım kimliği hesaba kaydedilir
3. Tarayıcıda `https://ilsasupport.com` otomatik açılır

## Notlar

- Web sitesinden normal kullanıcı girişi kapalıdır (yalnızca masaüstü).
- Yönetici web girişi: `/?view=admin` (admin hesabı).
- Cihaz değişimi: admin panelinden «cihaz sıfırla».
