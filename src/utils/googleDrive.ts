export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // https://drive.google.com/file/d/{id}/view
    const filePathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];

    // https://drive.google.com/open?id={id}
    const idParam = parsed.searchParams.get('id');
    if (idParam) return idParam;

    // https://drive.google.com/uc?id={id}
    if (parsed.pathname === '/uc' && idParam) return idParam;

    // https://drive.usercontent.google.com/download?id={id}&...
    if (parsed.hostname === 'drive.usercontent.google.com' && idParam) return idParam;
  } catch {
    // Geçersiz URL formatı
  }

  return null;
}

export function buildGoogleDriveDirectDownloadUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`;
}

/** Google Drive dosya önizleme sayfası (resimler için; indirme URL’si değil) */
export function buildGoogleDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}
