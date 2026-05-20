/**
 * DOWNLOAD FIX PATCH
 * 
 * index.tsx'deki download endpoint'inde (satır ~1624-1690 arası)
 * aşağıdaki kodu kullanın:
 */

// ❌ ESKİ KOD (Kaldırın):
/*
try {
  // 🌐 METHOD 1: Direct download link (confirm=t ile büyük dosyalar için)
  console.log('🔄 Method 1: Direct download link deneniyor...');
  const directUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}&confirm=t`;
  
  const directResponse = await fetch(directUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  
  if (directResponse.ok) {
    console.log(`✅ Direct download başarılı: ${downloadData.fileName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return new Response(directResponse.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadData.fileName)}"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  console.log(`⚠️ Direct download başarısız (${directResponse.status}), API deneniyor...`);
  
  // 🔑 METHOD 2: Google Drive API (fallback)
  console.log('🔄 Method 2: Google Drive API deneniyor...');
  const apiResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&key=${apiKey}`
  );

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    console.error(`❌ Google Drive API hatası: ${apiResponse.status} - ${error}`);
    console.error(`❌ API key muhtemelen referrer kısıtlamasına sahip.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 ÇÖZÜM:');
    console.log('   1. Google Cloud Console > APIs & Services > Credentials');
    console.log('   2. API key seç > Application restrictions > None');
    console.log('   3. VEYA: Website restrictions > Add: *.supabase.co');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return c.json({ 
      error: 'Google Drive dosyasına erişilemiyor', 
      details: 'Dosya public değil veya API key kısıtlaması var. Lütfen dosyayı "Anyone with the link" olarak paylaşın.',
      apiError: JSON.parse(error),
      status: apiResponse.status 
    }, 500);
  }

  console.log(`✅ Google Drive API başarılı: ${downloadData.fileName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return new Response(apiResponse.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadData.fileName)}"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
} catch (error) {
  console.error('❌ Google Drive indirme hatası:', error);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return c.json({ error: 'Dosya indirme başarısız' }, 500);
}
*/

// ✅ YENİ KOD (Kullanın):
try {
  // 🎯 Proxy fonksiyonunu kullan (tüm dosya tipleri için optimize edilmiş)
  const response = await proxyGoogleDriveDownload(
    driveFileId,
    downloadData.fileName,
    apiKey,
    c.req.raw.headers
  );
  
  console.log(`✅ Download proxy başarılı: ${downloadData.fileName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return response;
  
} catch (error) {
  console.error('❌ Google Drive indirme hatası:', error);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return c.json({ error: 'Dosya indirme başarısız', details: error.message }, 500);
}
