# ILSA Support — Sistem yapısı, çalışma mantığı ve deploy

Bu belge, üretim sunucusundaki bileşenlerin nasıl bağlandığını, Redis/RabbitMQ’nun ne işe yaradığını, derleme ve servis yeniden başlatma akışını özetler.

İlgili dosyalar: `docs/PERFORMANCE-SCALE.md` (ölçekleme), `docs/GIT-DEPLOY.md` (git deploy), `deploy/Caddyfile`.

---

## 1. Genel mimari

```mermaid
flowchart TB
  subgraph clients [İstemciler]
    Web[Tarayıcı SPA]
    Electron[Masaüstü Electron]
  end

  subgraph edge [Kenar]
    Caddy[Caddy 80/443]
  end

  subgraph api [API kümesi]
    W1[Deno :8787]
    W2[Deno :8788]
    W3[Deno :8789]
    W4[Deno :8790]
    W5[Deno :8791]
    W6[Deno :8792]
  end

  subgraph data [Veri ve arka plan]
    PG[(PostgreSQL)]
    Redis[(Redis 6379)]
    RMQ[RabbitMQ 5672]
    KV[KV store]
  end

  Web --> Caddy
  Electron --> Caddy
  Caddy --> W1 & W2 & W3 & W4 & W5 & W6
  W1 & W2 & W3 & W4 & W5 & W6 --> PG
  W1 & W2 & W3 & W4 & W5 & W6 --> Redis
  W1 & W2 & W3 & W4 & W5 & W6 --> RMQ
  W1 & W2 & W3 & W4 & W5 & W6 --> KV
  Caddy --> Static[build/ statik SPA]
```

| Katman | Teknoloji | Rol |
|--------|-----------|-----|
| Ön uç | React + Vite | `src/` → üretimde `build/` |
| Ters vekil | Caddy | HTTPS, statik dosya, API upstream |
| API | Deno + Hono | `src/supabase/functions/server/index.tsx` |
| İlişkisel veri | PostgreSQL | `bilgi`, `kategoriler`, `users`, `login_events`, … |
| Oturum / kullanıcı özeti | KV | `user:`, `session:` anahtarları |
| Önbellek | Redis | JWT, dosya listesi, site ayarları, `userkv` |
| Arka plan kuyruğu | RabbitMQ | Giriş logları (`login_event`) |

---

## 2. Windows servisleri

Kurulum: `scripts/install-windows-services.ps1` (WinSW ile `deploy/services/*.xml`).

| Servis | Betik / binary | Açıklama |
|--------|----------------|----------|
| **ILSA-Support-API** | `scripts/run-api-cluster-service.ps1` | 6 Deno worker; port 8787–8792; çöken worker 15 sn’de yeniden başlar |
| **ILSA-Support-Caddy** | `tools/caddy/caddy.exe` + `deploy/Caddyfile` | 80/443; `ILSA_ROOT` → `build/` + API proxy |
| **Redis** | `scripts/install-redis-service.ps1` | `127.0.0.1:6379`, servis adı: `Redis` |
| **RabbitMQ** | `scripts/install-rabbitmq-service.ps1` | `5672`, yönetim `15672` (guest/guest) |

**Bağımlılık:** Caddy servisi XML’de `ILSA-Support-API`’ye depend eder; API önce ayağa kalkmalı.

**Loglar:** `deploy/logs/` — `ILSA-Support-API.out.log`, `ILSA-Support-Caddy.err.log`, vb.

---

## 3. Ortam değişkenleri (`.env.local`)

API tüm worker’larda aynı dosyayı okur: `deno run -A --env-file=.env.local …`

Önemli anahtarlar:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://127.0.0.1:6379
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672/
RABBITMQ_QUEUE=ilsa.background          # varsayılan
CACHE_KEY_PREFIX=ilsa                     # Redis anahtar öneki
PG_POOL_MAX=8
JWT_ACTIVE_CACHE_SEC=45
FILES_LIST_CACHE_SEC=60
USER_CACHE_TTL_SEC=120
REDIS_RETRY_AFTER_MS=15000                # Redis hata sonrası yeniden deneme
PORT=8787                                 # worker başına WinSW/PORT ile override
```

Üretim bayrakları: `ILSA_PRODUCTION`, `ILSA_REQUIRE_ELECTRON_LOGIN` (Electron zorunlu giriş).

---

## 4. Redis — önbellek mantığı

**Kod:** `src/supabase/functions/server/cache/`

```
cache/index.ts          → Birleşik API (önce Redis, yoksa bellek)
cache/redis_cache.ts    → ioredis, REDIS_URL
cache/memory_cache.ts   → Süreç içi yedek (worker başına ayrı)
```

### Anahtar formatı

Tüm anahtarlar: `{CACHE_KEY_PREFIX}:{mantıksal_anahtar}` → örnek `ilsa:jwt:active:{jti}`.

### Kullanım yerleri

| Anahtar örneği | TTL | Amaç |
|----------------|-----|------|
| `jwt:active:{jti}` | `JWT_ACTIVE_CACHE_SEC` | JWT doğrulama; DB’ye her istekte gitmez |
| `userkv:{userId}` | `USER_CACHE_TTL_SEC` | Kullanıcı özeti (role/plan) |
| `files:v2:…` | `FILES_LIST_CACHE_SEC` | Dosya listesi / sayım |
| `site:settings` | ~8 sn | Site ayarları |

### Yedekleme (fallback)

1. `REDIS_URL` yok → yalnızca `memory_cache` (o worker için).
2. Redis geçici hata → `REDIS_RETRY_AFTER_MS` sonra yeniden dener; o arada bellek yedeği.
3. Kalıcı Redis kesintisi → her worker kendi bellek önbelleğini kullanır (cluster’da kısa süre tutarsızlık olabilir).

### Sağlık

- `GET /make-server-47081311/public/health-scale` → `cache`, `cacheConnected`
- `cacheHealth()` → canlı `redisPing()`

---

## 5. RabbitMQ — kuyruk mantığı

**Kod:** `src/supabase/functions/server/queue/message_queue.ts`

### Kuyruk adı

`RABBITMQ_QUEUE` veya varsayılan: **`ilsa.background`** (durable).

### Mesaj gövdesi

```json
{ "type": "login_event", "payload": { ... }, "at": 1730000000000 }
```

Handler kaydı: `registerQueueHandler(type, fn)` — boot’ta `initLoginAuditQueue()` `login_event` için INSERT yapar.

### Akış

```mermaid
sequenceDiagram
  participant API as API isteği
  participant Q as message_queue
  participant RMQ as RabbitMQ
  participant Mem as Bellek kuyruğu
  participant PG as PostgreSQL

  API->>Q: enqueue("login_event", payload)
  Q->>RMQ: sendToQueue (varsa kanal)
  alt RabbitMQ yok veya publish hata
    Q->>Mem: memQueue + drain (150ms)
  end
  RMQ->>Q: consume → handler
  Q->>PG: INSERT login_events
```

### Bağlantı yaşam döngüsü

1. **Boot:** `initMessageQueue()` — AMQP bağlanır, consumer başlar.
2. **Periyodik:** 30 sn’de bir kanal yoksa yeniden bağlanır.
3. **Kopma:** `error` / `close` → kanal sıfırlanır; sonraki `enqueue` veya timer tekrar dener.
4. **Yedek:** Publish başarısız → `memQueue` + toplu `drainMemQueue` (aynı handler’lar).

### Çok worker (6 API)

Her Deno süreci kendi AMQP bağlantısı ve **consumer** açar → RabbitMQ’da `consumers=6` normal (yarışmalı tüketim).

### Sağlık alanları (`health-scale`)

| Alan | Anlam |
|------|--------|
| `queue` | `rabbitmq` = URL tanımlı (eski: sadece env) |
| `queueConnected` | Bu worker’da aktif AMQP kanalı var mı |
| `queueConsumerActive` | Consumer çalışıyor mu |
| `queueMode` | `rabbitmq` \| `rabbitmq-degraded` \| `memory` |
| `queuePendingMemoryJobs` | Bellek kuyruğunda bekleyen iş |

---

## 6. Giriş logları (`login_audit`)

**Dosya:** `src/supabase/functions/server/login_audit.tsx`

- `logLoginEvent()` yalnızca **`enqueue('login_event', …)`** çağırır (senkron DB yok).
- Eski `pending` + `scheduleFlush` yolu kaldırıldı → **çift INSERT** riski giderildi.
- Tüketici: RabbitMQ veya bellek kuyruğu → `flushLoginEventsBatch` → `login_events` tablosu.

Giriş uçları (`index.tsx` signin vb.) başarılı/başarısız denemelerde `logLoginEvent` kullanır.

---

## 7. Derleme ve yayın

### 7.1 Web (SPA)

| Betik | Ne yapar |
|-------|----------|
| `scripts/build-production.ps1` | `VITE_PUBLIC_SITE_URL`, `ILSA_PRODUCTION` ile Vite build → `build-staging` → `build/` |
| `scripts/publish-production.ps1` | Daha kısa Vite build (yalnızca `build/`) |
| `npm run build` | package.json → vite build |

**Canlı site:** Caddy `root` → `{ILSA_ROOT}/build` — API yeniden başlatmadan statik dosyalar güncellenir.

### 7.2 Electron (masaüstü)

| Betik | Ne yapar |
|-------|----------|
| `scripts/build-electron-exe.ps1` | NSIS + portable (`electron-client`, `npm run dist`) |
| `scripts/package-electron-download.ps1` | Portable 1.0.x, ZIP, SHA256 → `public/downloads` + `build/downloads` |

**Sürüm:** `electron-client/package.json` → `version` (ör. `1.0.3`).  
**Çıktı:** `electron-client/release-package-1.0.3/ILSA-Support-Portable-1.0.3.exe`

**Not:** `package-electron-download.ps1` `package.json` yazarken UTF-8 **BOM kullanmamalı** (electron-builder BOM’lu JSON okuyamaz). Betik `Write-Utf8NoBom` ile düzeltildi.

### 7.3 Tam deploy sırası (önerilen)

```powershell
# 1) Web
powershell -ExecutionPolicy Bypass -File scripts\build-production.ps1

# 2) Electron (kaynak değiştiyse)
powershell -ExecutionPolicy Bypass -File scripts\package-electron-download.ps1 -Version 1.0.3

# 3) Servisler
Restart-Service Redis, RabbitMQ -Force
Restart-Service ILSA-Support-API -Force
# Caddy 2019 port çakışması varsa: Stop-Process -Name caddy -Force
Restart-Service ILSA-Support-Caddy -Force
```

Kısa yol (yalnızca API + Caddy, tek worker 8787): `scripts/restart-all.ps1`  
Tam küme için **ILSA-Support-API** servisini kullanın (`-Build` ile Vite: `restart-all.ps1 -Build`).

---

## 8. Caddy ve API yönlendirme

**Dosya:** `deploy/Caddyfile`

- Statik: `{$ILSA_ROOT}/build`, `try_files` → SPA.
- API: `reverse_proxy` → `localhost:8787` … `8792` (yük dengeleme).
- HTTP → HTTPS yönlendirme (308) — yerel `http://127.0.0.1/health` testinde redirect görülebilir; doğrudan test: `http://127.0.0.1:8787/.../public/health-scale`.

**ILSA_ROOT:** WinSW env → `C:\ilsasupport`.

---

## 9. Boot sırası (tek API worker)

`index.tsx` başlangıç:

1. Şema migration yardımcıları (`ensure*`)
2. `initLoginAuditQueue()` — handler kaydı
3. `await initMessageQueue()` — RabbitMQ bağlantı + consumer
4. `cacheHealth()` / `getQueueHealth()` log: `[boot] cache=… redis=… queue=…`
5. `Deno.serve` — `PORT` (varsayılan 8787)

Admin uçları: `setupAdminEndpoints` → `admin_endpoints.tsx`.

---

## 10. Kontrol komutları

```powershell
# Servisler
Get-Service Redis, RabbitMQ, ILSA-Support-API, ILSA-Support-Caddy

# Portlar
Get-NetTCPConnection -LocalPort 80,443,6379,5672,8787,8788,8789,8790,8791,8792 -State Listen

# Redis
C:\ilsasupport\tools\redis\redis-cli.exe -h 127.0.0.1 ping
C:\ilsasupport\tools\redis\redis-cli.exe -h 127.0.0.1 KEYS "ilsa:*"

# API sağlık
Invoke-RestMethod http://127.0.0.1:8787/make-server-47081311/public/health-scale

# RabbitMQ kuyruk (yönetim API)
# http://127.0.0.1:15672 → kuyruk ilsa.background → consumers, messages
```

Beklenen üretim `health-scale` örneği:

```json
{
  "ok": true,
  "cache": "redis",
  "cacheConnected": true,
  "queue": "rabbitmq",
  "queueConnected": true,
  "queueConsumerActive": true,
  "queueMode": "rabbitmq",
  "queuePendingMemoryJobs": 0
}
```

---

## 11. Sık sorunlar

| Belirti | Olası neden | Çözüm |
|---------|-------------|--------|
| Site eski arayüz | `build/` güncellenmemiş | `build-production.ps1`, Ctrl+Shift+R |
| `queueMode: rabbitmq-degraded` | Worker henüz AMQP bağlanmadı veya kopuk | Birkaç sn bekle; giriş tetikler; `initMessageQueue` boot’ta çalışır |
| `consumers=0` (geçici) | Tüm worker’lar restart aşamasında | API servisinin Running olduğunu doğrula |
| Caddy **Stopped**, 2019 hata | İkinci `caddy.exe` (manuel) | `Stop-Process -Name caddy -Force`; `Start-Service ILSA-Support-Caddy` |
| Electron build JSON hatası | `package.json` BOM | `package-electron-download.ps1` UTF-8 no BOM; `electron-client/package.json` düzelt |
| Admin paneli yok | Eski `build` veya oturum | Yeniden build + admin giriş; `/?view=admin` |

---

## 12. Kod haritası (hızlı referans)

```
src/supabase/functions/server/
  index.tsx                 # Ana Hono uygulaması, auth, dosya listeleri
  admin_endpoints.tsx       # Admin CRUD, stats, kategoriler
  login_audit.tsx           # Giriş log kuyruğu
  user_cache.ts             # userkv Redis önbelleği
  jwt_sessions.tsx          # JWT + jwt:active Redis
  postgresql_helpers.tsx    # Dosya listesi + files:v2 cache
  site_settings.tsx         # site:settings cache
  cache/
    index.ts, redis_cache.ts, memory_cache.ts
  queue/
    message_queue.ts
  setup_guard.ts            # Kurulum secret, IP rate limit (bellek)

scripts/
  build-production.ps1
  package-electron-download.ps1
  run-api-cluster-service.ps1
  restart-all.ps1
  install-redis-service.ps1
  install-rabbitmq-service.ps1
  install-windows-services.ps1

deploy/
  Caddyfile
  services/ILSA-Support-API.xml
  services/ILSA-Support-Caddy.xml
```

---

*Son güncelleme: Redis/RabbitMQ sağlık alanları, `initMessageQueue`, giriş logu tek kuyruk yolu ve Electron 1.0.3 deploy akışı ile uyumludur.*
