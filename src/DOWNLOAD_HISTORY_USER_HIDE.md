# İndirme Geçmişi: Kullanıcıdan Gizle (Soft Delete)

Bu not, son eklenen **"Silince ekrandan kalksın ama veritabanından silinmesin"** davranışını dokümante eder.

## Amaç

- Kullanıcı, profildeki indirme geçmişinde `Sil` dediğinde kayıt listeden kaldırılır.
- Kayıt fiziksel olarak silinmez; admin raporlarında görünmeye devam eder.
- Böylece kullanıcı UX’i temiz kalırken denetim/istatistik verisi korunur.

## Veritabanı Değişikliği

`user_download_history` tablosuna eklenen alanlar:

- `hidden_from_user BOOLEAN NOT NULL DEFAULT false`
- `hidden_at TIMESTAMPTZ`

İlgili SQL:

- `sql/11_user_download_history_user_hide.sql`
- `sql/03_pg_runtime_tables.sql`
- `sql/99_all_in_one.sql`

### Migration / şema

| Komut / dosya | Açıklama |
|---------------|----------|
| `npm run db:migrate:hide-history` | `.env.local` içindeki `DATABASE_URL` ile yalnızca `sql/11_user_download_history_user_hide.sql` çalıştırır. |
| `npm run db:schema` | `scripts/apply-pg-schema.cjs` — sıraya `11_user_download_history_user_hide.sql` dahildir (03’ten sonra). |
| `scripts/pg-run-single-sql.cjs` | Tek SQL dosyası çalıştırma (genel). |

**Üretim:** Migration’ı API’nin bağlandığı Postgres üzerinde çalıştırın; yalnızca yerel `.env.local` uzak veritabanını güncellemez.

## Backend Davranışı

### 1) Kullanıcı listesi

`GET /make-server-47081311/download-history`

- Dönen kayıtlarda `hiddenFromUser = true` olanlar filtrelenir.
- Kullanıcı sadece görünür kayıtlarını görür.

### 2) Kullanıcıdan gizleme endpoint’i

`POST /make-server-47081311/download-history/dismiss`

İstek:

```json
{
  "recordId": "uuid"
}
```

Sonuç:

- Önce **PostgreSQL**: `user_download_history` satırı `hidden_from_user = true`, `hidden_at = now()` ile güncellenir (önce `user_id = $uuid`, gerekirse `user_id::text` eşlemesi).
- Ardından **KV** (`download:<userId>:<recordId>`) aynı mantıkla senkronlanır (`sanitizeDownloadHistoryForKvHide`).
- Kayıt fiziksel olarak silinmez.
- Kolonlar yoksa **`503`**, `code: SCHEMA_MISMATCH`, `hint` ile migration yönlendirmesi (Postgres hata kodu `42703` vb.).

Ek teknik notlar: `resolveDownloadHistoryActor` (JWT, yoksa `validateSecureRequest`); `postgresErrorDetail` (Postgres `cause` zinciri).

### 3) Admin listesi

`GET /make-server-47081311/get-all-downloads`

- Tüm kayıtlar gelir (gizlenenler dahil).
- `hiddenFromUser` alanı sayesinde "kullanıcı gizledi" bilgisi görülebilir.

## Frontend Davranışı

### Profil / İndirme Geçmişi

- `Sil` butonu `dismiss` endpoint’ini çağırır (`buildOptionalAuthHeaders` / `getBearerForApi`, `X-New-Token` rotasyonu).
- Başarılı olunca kayıt UI listesinden kaldırılır.
- Hata yanıtında sunucunun `error`, `detail`, `hint`, `code` alanları tek mesajda gösterilir.
- Tooltip ile "kayıt sunucuda kalır" bilgisi gösterilir.

### Tekrar İndir

- `Tekrar indir` mevcut `request-download` akışını kullanır.
- Bu akış kayıtları silmez; normal indirme hazırlığını başlatır.

## Ek UI İyileştirmesi

İndirme geçmişi kartlarında:

- Göreli zaman (`Az önce`, `x saat önce`) korunur.
- Ek olarak tam tarih+saat gösterilir.
- Boyut alanı güvenli formatlanır (`NaN undefined` engellenir).

## Hızlı Test Checklist

- [ ] Profil > İndirme Geçmişi > `Sil` ile kayıt anında listeden kalkıyor.
- [ ] Aynı kullanıcı sayfayı yenileyince kayıt görünmüyor.
- [ ] Admin indirme listesinde aynı kayıt hâlâ görünüyor.
- [ ] `Tekrar indir` ile indirme akışı çalışıyor.
- [ ] Boyut alanında `NaN undefined` görünmüyor.

