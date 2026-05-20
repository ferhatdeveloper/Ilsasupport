/**
 * GOOGLE DRIVE DOSYA BOYUTU ÇEKME ENDPOİNT
 * 
 * index.tsx dosyasına eklenecek yeni endpoint
 * Satır ~1710'dan önce (// ===== PREMIUM İŞLEMLERİ ===== satırından önce) ekleyin
 */

// ===== GOOGLE DRIVE DOSYA BOYUTU ÇEKME =====
app.get('/make-server-47081311/fetch-drive-size', async (c) => {
  try {
    const driveUrl = c.req.query('url');
    
    if (!driveUrl) {
      return c.json({ error: 'URL parametresi gerekli' }, 400);
    }

    if (!driveUrl.includes('drive.google.com')) {
      return c.json({ error: 'Google Drive linki değil' }, 400);
    }

    // File ID çıkar
    const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)/);
    const driveFileId = fileIdMatch ? (fileIdMatch[1] || fileIdMatch[2]) : null;

    if (!driveFileId) {
      return c.json({ error: 'Google Drive File ID bulunamadı' }, 400);
    }

    console.log(`📊 Fetching metadata with Service Account: ${driveFileId}`);
    
    // 🔐 Service Account ile metadata al
    const metadata = await getFileMetadataWithServiceAccount(driveFileId);
    
    if (!metadata) {
      return c.json({ error: 'Dosya metadata alınamadı' }, 500);
    }

    const sizeBytes = parseInt(metadata.size || '0');
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    console.log(`✅ Metadata fetched: ${metadata.name} - ${sizeMB} MB`);

    return c.json({
      success: true,
      fileId: driveFileId,
      name: metadata.name,
      mimeType: metadata.mimeType,
      sizeBytes: sizeBytes,
      sizeMB: sizeMB,
      sizeFormatted: `${sizeMB} MB`,
    });

  } catch (error) {
    console.error('❌ Fetch Drive Size error:', error);
    return c.json({ 
      error: 'Google Drive metadata çekilemedi', 
      details: error.message 
    }, 500);
  }
});
