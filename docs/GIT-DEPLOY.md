# Git deploy (ILSA Support)

## İlk kurulum

1. [Git for Windows](https://git-scm.com/download/win) kurun.
2. Depo kökünde:

```powershell
cd C:\ilsasupport
git init
git remote add origin https://github.com/ferhatdeveloper/Ilsasupport.git
git add .
git commit -m "ILSA Support: ayarlar, oturum, deploy"
git branch -M main
git push -u origin main
```

## Otomatik sunucu güncellemesi

### A) Webhook (önerilen — self-hosted runner gerekmez)

1. Sunucuda secret tanımlayın:

```powershell
[System.Environment]::SetEnvironmentVariable('ILSA_DEPLOY_WEBHOOK_SECRET', 'uzun-rastgele-secret', 'Machine')
```

2. Dinleyiciyi başlatın (Yönetici PowerShell, URL ACL bir kez):

```powershell
netsh http add urlacl url=http://+:9876/deploy/ user=Everyone
cd C:\ilsasupport
.\scripts\webhook-deploy.ps1
```

3. GitHub → Repository → Settings → Webhooks → Add:
   - Payload URL: `http://SUNUCU-IP:9876/deploy/` (veya Caddy reverse proxy ile HTTPS)
   - Content type: `application/json`
   - Secret: yukarıdaki secret
   - Events: **Just the push event**

Push sonrası `deploy-from-git.ps1` çalışır.

### B) Self-hosted GitHub Actions runner

`.github/workflows/deploy-self-hosted.yml` — runner bu sunucuda kayıtlı olmalı.

### C) Manuel

```powershell
.\scripts\deploy-from-git.ps1
```

## Admin ayarları

Yönetim paneli → **Ayarlar**:

| Parametre | Açıklama |
|-----------|----------|
| Giriş yöntemi | Electron only / Web izinli |
| Web eşzamanlı oturum | Aynı kullanıcının kaç sekmede açık kalabileceği |
| Nabız süresi | Sekme kapanınca oturumun düşmesi için saniye |
| Yeni dosya toast | Üyelere bildirim |

Özet ekranında **aynı IP** uyarıları listelenir. Electron hataları Ayarlar sayfasında görünür.
