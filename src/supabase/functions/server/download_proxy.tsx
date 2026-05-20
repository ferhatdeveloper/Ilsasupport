// ============================================
// GOOGLE DRIVE DOWNLOAD PROXY
// ============================================
// Büyük dosyalar için stream ve range support
// Tüm dosya tipleri için optimize edilmiş (ZIP, resim, video, vb.)
// ============================================

/**
 * Google Drive dosyasını stream olarak proxy et
 * - Content-Length header korunur
 * - Range request desteği (pause/resume)
 * - Büyük dosyalar için optimize edilmiş
 * - Tüm dosya tipleri desteklenir (ZIP, JPG, PNG, PDF, vb.)
 */
export async function proxyGoogleDriveDownload(
  driveFileId: string,
  fileName: string,
  apiKey: string,
  requestHeaders: Headers
) {
  console.log(`📥 Google Drive proxy başlatılıyor: ${driveFileId}`);
  console.log(`📄 Dosya: ${fileName}`);
  
  // Request'ten Range header'ını al (pause/resume için)
  const rangeHeader = requestHeaders.get('Range');
  if (rangeHeader) {
    console.log(`📦 Range request: ${rangeHeader}`);
  }

  // 🔑 METHOD 1: Google Drive API ile direkt binary download (EN SAĞLIKLI)
  console.log('🔄 Method 1: Google Drive API (alt=media) deneniyor...');
  
  const apiHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  
  if (rangeHeader) {
    apiHeaders['Range'] = rangeHeader;
  }
  
  const apiResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&key=${apiKey}`,
    { headers: apiHeaders }
  );

  if (apiResponse.ok || apiResponse.status === 206) {
    console.log(`✅ Google Drive API başarılı (${apiResponse.status})`);
    
    const contentLength = apiResponse.headers.get('Content-Length');
    const contentType = apiResponse.headers.get('Content-Type');
    const contentRange = apiResponse.headers.get('Content-Range');
    
    console.log(`📦 Content-Type: ${contentType}`);
    console.log(`📦 Content-Length: ${contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) + ' MB' : 'Bilinmiyor'}`);
    if (contentRange) {
      console.log(`📦 Content-Range: ${contentRange}`);
    }
    
    // ⚠️ CRITICAL: HTML kontrolü (API'den genellikle gelmez ama kontrol edelim)
    if (contentType?.includes('text/html')) {
      console.log('❌ Google Drive API HTML döndürdü (çok nadir)');
      console.log('💡 Dosya muhtemelen Google Docs/Sheets formatında');
      throw new Error('Google Docs/Sheets dosyaları desteklenmiyor. Lütfen binary dosya yükleyin.');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Dosya uzantısına göre Content-Type belirleme
    const detectedContentType = detectContentType(fileName, contentType);

    // Response header'larını oluştur
    const responseHeaders: Record<string, string> = {
      'Content-Type': detectedContentType,
      'Content-Disposition': `attachment; filename=\"${encodeURIComponent(fileName)}\"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };
    
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }
    
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }
    
    const status = apiResponse.status === 206 ? 206 : 200;
    
    return new Response(apiResponse.body, {
      status,
      headers: responseHeaders,
    });
  }

  console.log(`⚠️ Google Drive API başarısız (${apiResponse.status})`);
  
  // API hatası detayları
  if (apiResponse.status === 403) {
    console.log('❌ 403 Forbidden - API key hatası veya dosya private');
    console.log('💡 Çözüm 1: API key\'in referrer restriction\'ını kaldırın');
    console.log('💡 Çözüm 2: Google Drive dosyasını "Anyone with the link" yapın');
  } else if (apiResponse.status === 404) {
    console.log('❌ 404 Not Found - Dosya bulunamadı veya silinmiş');
  }

  // 🌐 METHOD 2: Direct download link (fallback)
  console.log('🔄 Method 2: Direct download link deneniyor...');
  
  // confirm=t parametresi büyük dosyalar için virus scan uyarısını bypass eder
  const directUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}&confirm=t`;
  
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  
  // Range header varsa ekle (resume desteği)
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader;
  }
  
  const directResponse = await fetch(directUrl, {
    redirect: 'follow',
    headers: fetchHeaders,
  });
  
  if (directResponse.ok || directResponse.status === 206) { // 206 = Partial Content
    console.log(`✅ Direct download başarılı (${directResponse.status})`);
    
    // Content-Length header'ını al
    const contentLength = directResponse.headers.get('Content-Length');
    const contentType = directResponse.headers.get('Content-Type');
    const contentRange = directResponse.headers.get('Content-Range');
    
    console.log(`📦 Content-Type: ${contentType}`);
    console.log(`📦 Content-Length: ${contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) + ' MB' : 'Bilinmiyor'}`);
    if (contentRange) {
      console.log(`📦 Content-Range: ${contentRange}`);
    }
    
    // ⚠️ CRITICAL: Google Drive virus scan sayfası kontrolü
    if (contentType?.includes('text/html')) {
      console.log('❌ Google Drive virus scan HTML sayfası döndürdü!');
      console.log('🔄 Fallback: Google Drive API deneniyor...');
      // HTML döndüyse direkt API'ye geç
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Dosya uzantısına göre Content-Type belirleme
      const detectedContentType = detectContentType(fileName, contentType);
      
      // Response header'larını oluştur
      const responseHeaders: Record<string, string> = {
        'Content-Type': detectedContentType,
        'Content-Disposition': `attachment; filename=\"${encodeURIComponent(fileName)}\"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        'Accept-Ranges': 'bytes', // Parçalı indirme desteği
        'Cache-Control': 'no-cache', // Cache devre dışı
      };
      
      // Content-Length ekle (kritik!)
      if (contentLength) {
        responseHeaders['Content-Length'] = contentLength;
      }
      
      // Content-Range ekle (partial content için)
      if (contentRange) {
        responseHeaders['Content-Range'] = contentRange;
      }
      
      // Status code belirle (206 ise range request başarılı)
      const status = directResponse.status === 206 ? 206 : 200;
      
      return new Response(directResponse.body, {
        status,
        headers: responseHeaders,
      });
    }
  }
  
  console.log(`⚠️ Direct download başarısız (${directResponse.status}), API deneniyor...`);
  
  // 🔑 METHOD 2: Google Drive API (fallback)
  console.log('🔄 Method 2: Google Drive API deneniyor...');
  
  const apiFallbackHeaders: Record<string, string> = {};
  if (rangeHeader) {
    apiFallbackHeaders['Range'] = rangeHeader;
  }
  
  const apiFallbackResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&key=${apiKey}`,
    { headers: apiFallbackHeaders }
  );

  if (!apiFallbackResponse.ok && apiFallbackResponse.status !== 206) {
    const error = await apiFallbackResponse.text();
    console.error(`❌ Google Drive API hatası: ${apiFallbackResponse.status} - ${error}`);
    console.error(`❌ API key muhtemelen referrer kısıtlamasına sahip.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    throw new Error(`Google Drive API error: ${apiFallbackResponse.status} - ${error}`);
  }

  console.log(`✅ Google Drive API başarılı (${apiFallbackResponse.status})`);
  
  // Content-Length header'ını al
  const contentLength = apiFallbackResponse.headers.get('Content-Length');
  const contentType = apiFallbackResponse.headers.get('Content-Type');
  const contentRange = apiFallbackResponse.headers.get('Content-Range');
  
  console.log(`📦 Content-Type: ${contentType}`);
  console.log(`📦 Content-Length: ${contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) + ' MB' : 'Bilinmiyor'}`);
  if (contentRange) {
    console.log(`📦 Content-Range: ${contentRange}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Dosya uzantısına göre Content-Type belirleme
  const detectedContentType = detectContentType(fileName, contentType);

  // Response header'larını oluştur
  const responseHeaders: Record<string, string> = {
    'Content-Type': detectedContentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  
  if (contentLength) {
    responseHeaders['Content-Length'] = contentLength;
  }
  
  if (contentRange) {
    responseHeaders['Content-Range'] = contentRange;
  }
  
  const status = apiFallbackResponse.status === 206 ? 206 : 200;
  
  return new Response(apiFallbackResponse.body, {
    status,
    headers: responseHeaders,
  });
}

/**
 * Dosya uzantısına göre doğru Content-Type belirler
 * Google Drive bazen yanlış Content-Type döndürebilir
 */
function detectContentType(fileName: string, fallbackType: string | null): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const mimeTypes: { [key: string]: string } = {
    // Resim formatları
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    
    // Arşiv formatları
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    
    // Dokümantasyon
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Video formatları
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    
    // Audio formatları
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    
    // Text ve kod
    'txt': 'text/plain',
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    
    // Executable ve binary
    'exe': 'application/x-msdownload',
    'apk': 'application/vnd.android.package-archive',
    'dmg': 'application/x-apple-diskimage',
    'iso': 'application/x-iso9660-image',
  };
  
  if (ext && mimeTypes[ext]) {
    console.log(`📎 Content-Type belirlendi: ${fileName} → ${mimeTypes[ext]}`);
    return mimeTypes[ext];
  }
  
  // Fallback: Google Drive'dan gelen Content-Type veya generic binary
  return fallbackType || 'application/octet-stream';
}