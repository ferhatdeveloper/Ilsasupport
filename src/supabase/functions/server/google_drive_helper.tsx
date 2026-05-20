// Google Drive API Helper
// Google Drive linklerini direkt indirme linkine çevirir
// Google Drive API ile streaming download yapar

/**
 * Google Drive link formatları:
 * 
 * 1. https://drive.google.com/file/d/FILE_ID/view
 * 2. https://drive.google.com/open?id=FILE_ID
 * 3. https://drive.google.com/uc?id=FILE_ID
 * 4. https://drive.usercontent.google.com/download?id=FILE_ID&export=download
 */

/**
 * Tarayıcının doğrudan indirmesi için Google’ın usercontent indirme URL’si
 * (büyük dosyada virus scan uyarısı sayfası çıkabilir — kullanıcı onaylar).
 * @see https://drive.usercontent.google.com/download?id=…&export=download&authuser=0
 */
export function createUsercontentDirectDownloadUrl(fileId: string): string {
  const q = new URLSearchParams({
    id: fileId,
    export: 'download',
    authuser: '0',
  });
  return `https://drive.usercontent.google.com/download?${q.toString()}`;
}

/**
 * Bilinen Drive URL’lerini veya düz dosya kimliğini
 * `https://drive.usercontent.google.com/download?id=…&export=download&authuser=0` biçimine çevirir.
 * Drive dışı veya tanınmayan metin aynen döner.
 */
export function normalizeDriveUrlToUsercontent(url: string | null | undefined): string {
  if (url == null) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  const id = extractFileIdFromDriveUrl(trimmed);
  if (id) return createUsercontentDirectDownloadUrl(id);
  return trimmed;
}

export function extractFileIdFromDriveUrl(url: string): string | null {
  if (!url) return null;
  const input = String(url).trim();
  if (!input) return null;

  const candidates = [input];
  try {
    const decoded = decodeURIComponent(input);
    if (decoded && decoded !== input) candidates.push(decoded);
  } catch {
    // noop
  }

  for (const candidate of candidates) {
    // Format 1: /file/d/FILE_ID/view
    const filePattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const fileMatch = candidate.match(filePattern);
    if (fileMatch) return fileMatch[1];

    // Ek format: /d/FILE_ID (docs/sheets/paylaşım varyasyonları)
    const genericDPattern = /\/d\/([a-zA-Z0-9_-]+)/;
    const genericDMatch = candidate.match(genericDPattern);
    if (genericDMatch) return genericDMatch[1];

    // Format 2/3/4: query'de id=FILE_ID
    const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
    const idMatch = candidate.match(idPattern);
    if (idMatch) return idMatch[1];
  }

  // Düz dosya kimliği (URL değil; DB’de bazen sadece id saklanır)
  const bare = input;
  if (
    !/[\\/]/.test(bare) &&
    !/^https?:/i.test(bare) &&
    /^[A-Za-z0-9_-]{15,80}$/.test(bare)
  ) {
    return bare;
  }

  return null;
}

/**
 * Google Drive FILE_ID'den direkt indirme linki oluşturur
 * Bu link kullanıcıya gösterilir ve Google Drive'dan direkt indirir
 * confirm=t parametresi büyük dosyalar için virus scan uyarısını bypass eder
 */
export function createDirectDownloadLink(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
}

/**
 * 🚀 YENİ: Google Drive API Key kullanarak direkt download URL oluşturur
 * Bu URL direkt Google Drive API'den dosya indirir
 * API Key backend'de gizli tutulur
 * acknowledgeAbuse=true parametresi quota aşımlarını bypass eder
 */
export function createGoogleDriveApiDownloadUrl(fileId: string, apiKey: string): string {
  // supportsAllDrives: ortak/Team Drive dosyalarında ek sorgu olmadan en hızlı başarı
  // acknowledgeAbuse: Google'ın "zararlı olabilir" uyarılı dosyalarında tekrar istemeden indirme
  const q = new URLSearchParams({
    alt: 'media',
    key: apiKey,
    acknowledgeAbuse: 'true',
    supportsAllDrives: 'true',
  });
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${q.toString()}`;
}

/**
 * Google Drive URL'den direkt indirme linki oluşturur
 */
export function convertToDirectDownload(driveUrl: string): string | null {
  const fileId = extractFileIdFromDriveUrl(driveUrl);
  if (!fileId) return null;

  return createDirectDownloadLink(fileId);
}

/**
 * Tek kullanımlık download token oluşturur
 * Bu token kullanıcıya verilir ve sadece 1 kez kullanılabilir
 */
export function createDownloadToken(): string {
  const randomPart = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Date.now();
  return `dl_${timestamp}_${randomPart}`;
}

/**
 * Download session oluşturur (KV'de saklanacak)
 */
export function createDownloadSession(
  userId: string,
  fileId: string,
  googleDriveUrl: string,
  userIp: string
) {
  const token = createDownloadToken();
  
  // Google Drive için direkt link ve file ID oluştur
  const directLink = convertToDirectDownload(googleDriveUrl);
  const driveFileId = extractFileIdFromDriveUrl(googleDriveUrl);

  return {
    token,
    userId,
    fileId,
    googleDriveUrl,
    directLink: directLink || googleDriveUrl, // ✅ Google Drive değilse orijinal URL'i kullan
    driveFileId: driveFileId || null, // ✅ Google Drive değilse null
    userIp,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 dakika
    used: false,
  };
}

/**
 * Google Drive quota kontrolü için helper
 * Not: Gerçek API quota'sı izlemek için Google Cloud Console gerekir
 */
export function checkDriveQuota() {
  // Mock implementation
  // Gerçek kullanımda Google Drive API ile quota check yapılabilir
  return {
    available: true,
    dailyLimit: 10000,
    currentUsage: 0,
  };
}

/**
 * Download istatistikleri için helper
 */
export function createDownloadLog(
  userId: string,
  fileId: string,
  fileName: string,
  fileSize: number,
  userIp: string
) {
  return {
    userId,
    fileId,
    fileName,
    fileSize,
    userIp,
    downloadedAt: new Date().toISOString(),
    success: true,
  };
}

/**
 * Google Drive API ile dosya metadata'sı çeker
 * @param fileId - Google Drive file ID
 * @param apiKey - Google Drive API key
 */
export async function getFileMetadata(fileId: string, apiKey: string) {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://ilsasupport.com', // ✅ Referer header ekle
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      
      // 403 hatası - API Key restriction
      if (response.status === 403) {
        console.warn('⚠️ Google Drive API Key has HTTP Referrer restriction');
        console.warn('💡 Çözüm: Google Cloud Console > Credentials > API Key > Application restrictions > None');
        // Sessizce null döndür (fallback için)
        return null;
      }
      
      console.error(`❌ Google Drive API error (metadata): ${error}`);
      throw new Error(`Google Drive API error: ${response.status}`);
    }
    
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.error('❌ Error fetching file metadata:', error);
    // Sessizce null döndür (fallback için)
    return null;
  }
}

/**
 * Google Drive API ile dosyayı stream olarak indirir
 * @param fileId - Google Drive file ID
 * @param apiKey - Google Drive API key
 * @returns ReadableStream
 */
export async function downloadFileStream(fileId: string, apiKey: string): Promise<Response> {
  try {
    const q = new URLSearchParams({
      alt: 'media',
      key: apiKey,
      acknowledgeAbuse: 'true',
      supportsAllDrives: 'true',
    });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${q.toString()}`;
    
    console.log(`📥 Starting Google Drive download: ${fileId}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Google Drive API error (download): ${error}`);
      throw new Error(`Google Drive API download error: ${response.status}`);
    }
    
    console.log(`✅ Google Drive stream started: ${fileId}`);
    return response;
    
  } catch (error) {
    console.error('❌ Error downloading file from Google Drive:', error);
    throw error;
  }
}

/**
 * Chunked stream için progress tracking helper
 */
export function createStreamWithProgress(
  stream: ReadableStream,
  totalSize: number,
  onProgress?: (downloaded: number, total: number) => void
): ReadableStream {
  let downloaded = 0;
  
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            controller.close();
            if (onProgress) {
              onProgress(totalSize, totalSize);
            }
            break;
          }
          
          downloaded += value.length;
          controller.enqueue(value);
          
          if (onProgress) {
            onProgress(downloaded, totalSize);
          }
        }
      } catch (error) {
        controller.error(error);
        throw error;
      } finally {
        reader.releaseLock();
      }
    }
  });
}