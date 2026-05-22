# Yüksek eşzamanlılık (10.000+ kullanıcı)

## Mimari

| Katman | Teknoloji | Görev |
|--------|-----------|--------|
| Önbellek | **Redis** (`REDIS_URL`) | JWT doğrulama, site ayarları, dosya listesi sayfaları |
| Kuyruk | **RabbitMQ** (`RABBITMQ_URL`) | Giriş logları, arka plan işleri |
| API | **Deno × 6 worker** (8787–8792) | `scripts/start-api-cluster.ps1` |
| Veritabanı | **PostgreSQL** | `PG_POOL_MAX=40` (artırılabilir) |

Redis/RabbitMQ yoksa sistem bellek içi kuyruk ve süreç önbelleği ile çalışmaya devam eder (tek sunucu için sınırlı).

### RabbitMQ (Windows servisi)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-rabbitmq-service.ps1
```

- Servis: `RabbitMQ` — `amqp://guest:guest@127.0.0.1:5672/`
- Yönetim: http://127.0.0.1:15672 (guest/guest)

### Redis (Windows servisi)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-redis-service.ps1
```

- Servis adı: `Redis` (görünen ad: **ILSA Support Redis**)
- Adres: `127.0.0.1:6379` — `.env.local` içinde `REDIS_URL=redis://127.0.0.1:6379`
- Başlatma: `Automatic` (sunucu açılışında)
- Kontrol: `Get-Service Redis` · `redis-cli -h 127.0.0.1 ping`

## Ortam değişkenleri (.env.local)

```env
REDIS_URL=redis://127.0.0.1:6379
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672/
PG_POOL_MAX=50
BCRYPT_MAX_PARALLEL=12
JWT_ACTIVE_CACHE_SEC=45
FILES_LIST_CACHE_SEC=30
USER_CACHE_TTL_SEC=120
# İndirme dışında JWT her istekte tüketilmesin (varsayılan kapalı)
JWT_ROTATE_EVERY_REQUEST=0
```

## SQL indeksleri

```powershell
node scripts/pg-run-single-sql.cjs sql/12_performance_indexes.sql
```

## API kümesi

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-api-cluster.ps1 -Workers 4
```

Caddy `Caddyfile` upstream örneği:

```
reverse_proxy localhost:8787 localhost:8788 localhost:8789 localhost:8790
```

## İstemci optimizasyonları

- Dosya listesi GET istekleri paralel (sıra kuyruğu yok)
- Web nabız: varsayılan 90 sn, sekme gizliyken durur
- Yeni dosya bildirimi: 3 dakikada bir poll

## Üretim kontrol listesi

1. Redis + RabbitMQ ayrı VM veya container
2. En az 4 API worker + yük dengeleyici
3. PostgreSQL `max_connections` ≥ `PG_POOL_MAX × worker sayısı`
4. `sql/12_performance_indexes.sql` uygulandı
5. Admin sunucu durumu (CPU/RAM) yalnızca gerektiğinde açılır
