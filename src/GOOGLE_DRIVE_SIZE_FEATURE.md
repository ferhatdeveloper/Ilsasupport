# 📦 Google Drive Dosya Boyutu Özelliği

## ✅ Mevcut Durum

### 1. **PostgreSQL'den Gelen Boyut**
- `bilgi` tablosunda `boyut` alanı var
- Backend: `/supabase/functions/server/postgresql_helpers.tsx` (satır 250)
- Frontend: `/components/FileList.tsx` (satır 289-297)

**Gösterim:**
```jsx
{file.size && file.size > 0 ? (
  <div className="flex items-center gap-1">
    <span>📦</span>
    <span className="font-semibold text-blue-400">
      {(file.size / 1024 / 1024).toFixed(2)} MB
    </span>
  </div>
) : (
  <div className="text-xs text-gray-600">Boyut: Bilinmiyor</div>
)}
```

### 2. **Google Drive API ile Boyut Çekme**

#### Helper Fonksiyon
📄 `/supabase/functions/server/google_drive_helper.tsx` (satır 132-149)

```typescript
export async function getFileMetadata(fileId: string, apiKey: string) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType&key=${apiKey}`;
  const response = await fetch(url);
  const metadata = await response.json();
  return metadata; // { id, name, size, mimeType }
}
```

#### Yeni Endpoint (Oluşturuldu)
📄 `/supabase/functions/server/fetch_drive_size_endpoint.tsx`

```
GET /make-server-47081311/fetch-drive-size?url=GOOGLE_DRIVE_URL
```

**Response:**
```json
{
  "success": true,
  "fileId": "1abc...",
  "name": "A115F U6 FRP.png",
  "mimeType": "image/png",
  "sizeBytes": 1234567,
  "sizeMB": "1.18",
  "sizeFormatted": "1.18 MB"
}
```

## 🔧 Kullanım Senaryoları

### Senaryo 1: Admin Panelinde Dosya Eklerken
Admin Google Drive linki yapıştırdığında otomatik boyut çekilebilir.

**Frontend Kodu:**
```typescript
const fetchDriveSize = async (driveUrl: string) => {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-47081311/fetch-drive-size?url=${encodeURIComponent(driveUrl)}`
  );
  const data = await response.json();
  console.log(`📊 Dosya boyutu: ${data.sizeMB} MB`);
  return data.sizeBytes;
};
```

### Senaryo 2: Mevcut Dosyalar İçin Toplu Boyut Güncelleme
Admin panelinde "Boyutları Güncelle" butonu ile tüm dosyalar için boyut çekilebilir.

### Senaryo 3: Dosya Görüntülerken Gerçek Zamanlı Çekme
Dosya listesi yüklenirken boyut bilinmiyorsa Google Drive'dan otomatik çekilebilir.

## 📊 Console Log Çıktısı

Frontend'de her dosya için:
```javascript
File data: {
  id: "123",
  name: "A115F U6 FRP.png",
  size: 1234567,
  sizeMB: "1.18",
  googleDriveLink: "https://drive.google.com/...",
  hasLink: true
}
```

## 🎯 Sonraki Adımlar

1. ✅ Boyut gösterimi frontend'de mavi renk ile vurgulandı
2. ✅ Boyut bilinmiyorsa "Boyut: Bilinmiyor" yazısı gösteriliyor
3. ✅ Console loglarında dosya boyutu görünüyor
4. 📝 **TODO:** Admin panelinde "Boyut Çek" butonu eklenebilir
5. 📝 **TODO:** Dosya eklerken otomatik boyut çekme
6. 📝 **TODO:** Toplu boyut güncelleme endpoint'i

## 🔍 Test

1. Tarayıcı konsolunu açın (F12)
2. Bir kategoriye girin
3. Console'da her dosya için şunu göreceksiniz:
   ```
   File data: {
     id: "123",
     name: "A115F U6 FRP.png",
     size: 1234567,
     sizeMB: "1.18",
     googleDriveLink: "https://...",
     hasLink: true
   }
   ```
4. Dosya kartında boyut mavi renk ile vurgulanmış olacak: **📦 1.18 MB**

## 💡 Notlar

- Google Drive API key gerekli: `GOOGLE_DRIVE_API_KEY`
- Metadata çekmek için API quota kullanır (günlük 10,000 requests)
- Boyut bytes cinsinden döner, MB'a çevrilmeli: `size / 1024 / 1024`
- Boyut 0 veya null ise "Bilinmiyor" gösterilir
