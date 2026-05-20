# ilsasupport.com — DNS ve SSL (Caddy)

## 1. DNS kayıtları (alan adı panelinde)

Sunucu IP’nizi öğrenin (ör. `194.62.52.140`):

| Tür | Ad | Değer | TTL |
|-----|-----|--------|-----|
| A | `@` | `SUNUCU_IP` | 300 |
| A | `www` | `SUNUCU_IP` | 300 |

İsteğe bağlı: `www` için CNAME → `ilsasupport.com` (A kaydı da yeterli).

Yayılma 5–60 dakika sürebilir. Kontrol:

```powershell
nslookup ilsasupport.com
nslookup www.ilsasupport.com
```

## 2. Sunucuda (Windows, yönetici PowerShell)

```powershell
cd C:\ilsasupport
powershell -ExecutionPolicy Bypass -File scripts\install-caddy.ps1
powershell -ExecutionPolicy Bypass -File scripts\open-ports-caddy.ps1
```

DNS A kaydı `194.62.52.140` olmalı. Nameserver’lar Türk Ticaret varsayılanı veya `ns1`/`ns2` bölgesinde aynı A kaydı.

Sertifika: Caddy Let's Encrypt otomatik (`deploy\Caddyfile`). Değişiklik sonrası: `scripts\restart-caddy.ps1`

**Windows servisi (önerilen — yeniden başlatma / çökme sonrası otomatik):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1
```

Elle başlatma (geliştirme):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-caddy-production.ps1 -Background
```

## 3. Ne dinliyor?

| Port | Servis |
|------|--------|
| 443 / 80 | Caddy (HTTPS / HTTP→HTTPS) |
| 8787 | Deno API (yalnızca localhost; dışarıdan `/make-server-47081311` Caddy üzerinden) |
| — | Statik site: `build/` (önce `npm run build`) |

## 4. Üretim derlemesi

```powershell
# .env.local örneği:
# VITE_PUBLIC_SITE_URL=https://ilsasupport.com
# ILSA_PRODUCTION=true
npm run build
```

## 5. Sorun giderme

- **Sertifika alınamıyor:** DNS henüz bu sunucuya gelmemiş veya 80/443 dışarıdan kapalı.
- **80 meşgul:** IIS veya Vite — `start-caddy-production.ps1` Vite’ı durdurur; IIS için `iisreset /stop` gerekebilir.
- **API 502:** `8787` dinlemiyor — `.env.local` ile `npm run api` veya start betiği.
