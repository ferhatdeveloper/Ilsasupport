# ILSA Listeleme ve DB Bağlantı Şablonu

Bu doküman, eski PHP akışındaki kategori/bilgi listeleme mantığını yeni PostgreSQL tabanlı yapıda aynı davranışla sürdürmek için pratik bir referanstır.

## 1) Listeleme Mantığı (Eski PHP ile Uyumlu)

Eski akış 4 seviyeli düşünülür:

1. **Ana kategoriler (main)**  
   - Koşul: `altkat = '0'`
2. **Soft seviyesi** (ana kategoriye girince)
   - Koşul: `altkat = <secilen_id>` ve `alkat2 = '0'`
3. **Alt seviye** (soft içindeki alt)
   - Koşul: `alkat2 = <secilen_id>`
4. **Bilgiler / dosyalar**
   - Koşul (legacy davranış): `bilgi.altkat = <kategori_id>`

Not: JSON migrasyonundan sonra `kategoriler` tablosunda `legacy_altkat` ve `legacy_alkat2` alanları bu uyumu korumak için tutulur.

## 2) Kategori Hiyerarşisi Dönüşümü

Migrasyonda `ust_kategori_id` şu öncelik ile üretilir:

- `alkat2 > 0` ise `ust_kategori_id = alkat2`
- değilse `altkat != 0` ise `ust_kategori_id = altkat`
- aksi durumda `ust_kategori_id = NULL`

Bu yaklaşım, çok seviyeli ağacı PostgreSQL FK ile kurar.

## 3) FK Güvenli Kategori Migrasyonu

`kategoriler_ust_kategori_id_fkey` hatalarını önlemek için:

- JSON’dan gelen tüm kategori kayıtları maplenir.
- Referans verilen ama JSON’da olmayan üst id’ler için **sentetik parent** eklenir (`slug = missing-parent-<id>`).
- Insert sırası, parent-before-child olacak şekilde **topolojik sıralama** ile belirlenir.

Bu sayede `INSERT/UPSERT` sırasında FK ihlali minimuma iner.

## 4) PostgreSQL Bağlantı Şablonu (Deno)

```ts
// pg_client.ts
import postgres from "https://deno.land/x/postgresjs/mod.js";

let sqlInstance: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (sqlInstance) return sqlInstance;

  const dbUrl = Deno.env.get("DATABASE_URL");
  if (!dbUrl) throw new Error("DATABASE_URL tanımlı değil");

  sqlInstance = postgres(dbUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return sqlInstance;
}
```

## 5) Kategori UPSERT Şablonu

```ts
await sql`
  INSERT INTO kategoriler (
    id, kategori_adi, ust_kategori_id, aciklama, resim, sira, durum, eklenme_tarihi,
    legacy_altkat, legacy_alkat2, slug
  ) VALUES (
    ${record.id},
    ${record.kategori_adi},
    ${record.ust_kategori_id},
    ${record.aciklama},
    ${record.resim},
    ${record.sira},
    ${record.durum},
    ${record.eklenme_tarihi}::timestamptz,
    ${record.legacy_altkat},
    ${record.legacy_alkat2},
    ${record.slug}
  )
  ON CONFLICT (id) DO UPDATE SET
    kategori_adi = EXCLUDED.kategori_adi,
    ust_kategori_id = EXCLUDED.ust_kategori_id,
    aciklama = EXCLUDED.aciklama,
    resim = EXCLUDED.resim,
    sira = EXCLUDED.sira,
    durum = EXCLUDED.durum,
    legacy_altkat = EXCLUDED.legacy_altkat,
    legacy_alkat2 = EXCLUDED.legacy_alkat2,
    slug = EXCLUDED.slug
`;
```

## 6) Bilgi (Dosya) Listeleme Sorgu Şablonları

### 6.1 Kategoriye bağlı dosyalar

```sql
SELECT id, dosya_adi, aciklama, url, katid, altkat, tarih
FROM bilgi
WHERE altkat = $1
ORDER BY id DESC;
```

### 6.2 Arama (PHP davranışına yakın)

```sql
SELECT id, dosya_adi, aciklama, url, katid, altkat, tarih
FROM bilgi
WHERE dosya_adi ILIKE '%' || $1 || '%'
   OR aciklama ILIKE '%' || $1 || '%'
ORDER BY id DESC
LIMIT 200;
```

## 7) API Akış Şablonu

- `GET /api/kategoriler?parentId=<id>`  
  Parent id’ye göre çocuk kategorileri getirir.
- `GET /api/bilgiler?altkat=<id>`  
  İlgili kategori/alt kategori dosyalarını getirir.
- `GET /api/search?q=<term>`  
  Kategori + dosya bazlı birleşik arama döndürür.

## 8) Doğrulama Checklist

- Migrasyon sonrası `kategoriler` hatası: `0` olmalı (veya yalnızca loglanmış özel durumlar).
- Derin zincir testleri (örnek: `2111 -> 2112 -> dosyalar`) UI’da doğru açılmalı.
- Arama sonucu tıklayınca doğru kategori yoluna navigasyon olmalı.
- `missing-parent-*` kayıtları raporlanmalı; mümkünse gerçek parent ile sonradan düzeltilmeli.

