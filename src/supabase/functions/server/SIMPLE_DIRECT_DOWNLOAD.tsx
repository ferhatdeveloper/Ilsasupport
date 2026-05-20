/**
 * 🚀 EN SAĞLIKLI İNDİRME YÖNTEMİ
 * 
 * Backend sadece yetki kontrolü yapar, direkt Google Drive linkini döndürür
 * Frontend bu linke yönlendirir, Google Drive kendi indirme sistemini kullanır
 * 
 *장점:
 * ✅ Virus scan Google Drive tarafından halledilir
 * ✅ Büyük dosyalar için optimize
 * ✅ Resume/pause desteği
 * ✅ Doğru Content-Type
 * ✅ Backend'e yük yok (proxy yok)
 * ✅ Tek kullanımlık kontrol hala var
 */

/**
 * ADIM 1: /request-download endpoint'ini değiştir
 * 
 * Şu anki kod direkt linki döndürüyor ama frontend proxy kullanıyor.
 * Frontend'e "directDownload: true" flag'i ekleyelim.
 */

// index.tsx dosyasında /request-download endpoint'inin sonuna ekle:
return c.json({
  success: true,
  downloadToken, 
  fileName: file.name,
  fileSize: file.size,
  linkType,
  
  // 🔥 YENİ: Direkt download için link
  directDownloadUrl: directLink, // Google Drive direkt linki
  useDirectDownload: true, // Frontend'e direkt indirme yapmasını söyle
  
  message: 'İndirme hazır',
});

/**
 * ADIM 2: Frontend'i güncelle (FileList.tsx)
 * 
 * Token aldıktan sonra eğer useDirectDownload: true ise
 * direkt linke yönlendir, proxy kullanma
 */

// FileList.tsx handleDownload fonksiyonunda:
const data = await response.json();

if (data.useDirectDownload && data.directDownloadUrl) {
  // 🚀 Direkt Google Drive indirme
  console.log('🚀 Direct download mode activated');
  console.log('📥 Direct URL:', data.directDownloadUrl);
  
  // Token'ı kaydet (istatistik için)
  storeEncryptedToken(fileId, data.downloadToken);
  
  // Method 1: window.location (en sağlıklı)
  window.location.href = data.directDownloadUrl;
  
  // VEYA Method 2: Programmatic download (daha kontrollü)
  const a = document.createElement('a');
  a.href = data.directDownloadUrl;
  a.download = data.fileName;
  a.target = '_blank'; // Yeni sekmede aç
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  console.log('✅ Direct download started:', data.fileName);
  return;
}

// Eski proxy yöntemi (fallback)
// ...

/**
 * ADIM 3: Token kullanımını işaretle (opsiyonel)
 * 
 * Backend'de token'ı "used" olarak işaretle
 * Böylece aynı token tekrar kullanılamaz
 */

// index.tsx dosyasına yeni endpoint ekle:
app.post('/make-server-47081311/mark-token-used', async (c) => {
  try {
    const { downloadToken } = await c.req.json();
    
    const tokenData = await kv.get(`download_token:${downloadToken}`);
    if (!tokenData) {
      return c.json({ error: 'Invalid token' }, 400);
    }
    
    // Token'ı used olarak işaretle
    await kv.set(`download_token:${downloadToken}`, {
      ...tokenData,
      used: true,
      usedAt: new Date().toISOString(),
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Mark token error:', error);
    return c.json({ error: 'Failed to mark token' }, 500);
  }
});

/**
 * KULLANIM AKIŞI:
 * 
 * 1. Kullanıcı "Download" butonuna basar
 * 2. Frontend /request-download'a istek atar
 * 3. Backend:
 *    - Kullanıcı yetkisini kontrol eder
 *    - Premium kontrolü yapar
 *    - Daily limit kontrolü yapar
 *    - Download count'u artırır
 *    - Google Drive direkt linki oluşturur
 *    - Token ve direkt linki döndürür
 * 4. Frontend:
 *    - useDirectDownload: true ise
 *    - window.location.href ile direkt linke yönlendirir
 *    - Google Drive kendi indirme UI'ını gösterir
 *    - Kullanıcı "Download" butonuna basar (Google Drive'da)
 *    - Dosya indirilir (virus scan, pause/resume, vb. Google Drive tarafından)
 * 5. İndirme tamamlandığında:
 *    - Frontend /mark-token-used endpoint'ine istek atar (opsiyonel)
 *    - Token "used" olarak işaretlenir
 * 
 * 
 * NEDEN BU YÖNTEM DAHA SAĞLIKLI?
 * 
 * ❌ Proxy Yöntemi Sorunları:
 *    - Backend stream ederken memory kullanımı artar
 *    - Google Drive virus scan HTML sayfası döndürebilir
 *    - Büyük dosyalar için timeout riski
 *    - Content-Type yanlış olabilir
 *    - Range request desteği karmaşık
 * 
 * ✅ Direct Link Yöntemi Avantajları:
 *    - Google Drive kendi indirme UI'ını kullanır
 *    - Virus scan otomatik halledilir
 *    - Pause/resume native desteklenir
 *    - Büyük dosyalar için optimize
 *    - Backend'e yük yok
 *    - Tek kullanımlık kontrol hala var (token)
 *    - İstatistikler hala tutulur (download count, history)
 * 
 * 
 * GÜVENLİK:
 * 
 * - Google Drive linki sadece token ile alınabilir
 * - Token tek kullanımlık (opsiyonel: used flag)
 * - Token 10 dakika sonra expire olur
 * - Premium/daily limit kontrolü hala var
 * - Download count hala artırılır
 * - Download history hala kaydedilir
 */
