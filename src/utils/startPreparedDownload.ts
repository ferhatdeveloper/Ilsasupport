import { apiFunctionsBase } from './supabase/info';
import { isElectronShell } from './secureApi';
import { openUrlInSystemBrowser } from './electronBrowser';
import { buildGoogleDriveViewUrl, extractGoogleDriveFileId } from './googleDrive';
import { isBilgiImageEntry, looksLikeRasterImageFilename, shouldOpenAsGoogleDriveImage } from './bilgiImageFlag';

/**
 * Modal içi iframe: Google / proxy indirme için GET formu üretir.
 * Vite dev'de `apiFunctionsBase` göreli olduğundan `new URL(url)` tek başına patlar; taban kök şart.
 */
export function buildDownloadFormSrcDoc(url: string): string | null {
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(url, base);
    const action = `${parsed.origin}${parsed.pathname}`;
    const hiddenInputs = Array.from(parsed.searchParams.entries())
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${name.replace(/"/g, '&quot;')}" value="${value.replace(/"/g, '&quot;')}">`,
      )
      .join('');

    return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; }
      #wrap { text-align: center; padding: 24px; }
      #uc-download-link {
        border: 0; border-radius: 10px; padding: 12px 20px; background: #2563eb; color: #fff; cursor: pointer;
        font-size: 14px; font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div id="wrap">
      <form id="download-form" action="${action}" method="get">
        ${hiddenInputs}
        <input type="submit" id="uc-download-link" value="Yine de indir">
      </form>
    </div>
  </body>
</html>`;
  } catch {
    return null;
  }
}

export function shouldShowDownloadUrlInIframe(url: string): boolean {
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(url, base);
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes('google.com') ||
      host.includes('googleusercontent.com') ||
      host.includes('drive.usercontent.google.com')
    );
  } catch {
    return false;
  }
}

/** Önizleme için güvenli raster uzantılar (SVG script içerebilir; iframe kullanılır) */
export { looksLikeRasterImageFilename } from './bilgiImageFlag';

/** Google ara / virüs uyarısı veya backend tek kullanımlık indir — içerik HER ZAMAN iframe ile (img/sekme atlaması olmaz) */
export function shouldForceIframeDriveDownloadFlow(url: string): boolean {
  if (shouldShowDownloadUrlInIframe(url)) return true;
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    return new URL(url, base).pathname.includes('/download-file/');
  } catch {
    return false;
  }
}

/**
 * Ilsasupport-main ile aynı: yalnızca Google barındıran URL'lerde doğrudan `iframe src`.
 * `/download-file/` ve diğerleri `srcDoc` GET formu → ara yüz / kullanıcı tetiklemesi, ani attachment indirmesi azalır.
 */
export function getDownloadIframeFrameProps(url: string): { src?: string; srcDoc?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { srcDoc: '<p>Bağlantı hazır değil.</p>' };
  }
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return { src: trimmed };
  }
  if (shouldShowDownloadUrlInIframe(trimmed)) {
    return { src: trimmed };
  }
  return {
    srcDoc: buildDownloadFormSrcDoc(trimmed) || '<p>Form hazırlanamadı</p>',
  };
}

/** /request-download (veya uyumlu) JSON gövdesi */
export type PreparedDownloadPayload = {
  downloadToken?: string;
  fileName?: string;
  useDirectDownload?: boolean;
  useBackendDriveStream?: boolean;
  downloadUrl?: string;
  /** Google Drive: modal iframe için doğrudan usercontent/indirme URL’si */
  driveIframePreviewUrl?: string;
  /** Raster resim: Google Drive /view (indirme proxy’si değil) */
  driveImageViewUrl?: string;
  /** Admin «Bu resimdir» işaretli kayıt */
  isImageEntry?: boolean;
};

export type ImageDirectViewContext = {
  driveFileId?: string | null;
  driveUrl?: string | null;
  notification?: string | null;
};

function isGoogleDriveFileViewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes('drive.google.com') && /\/file\/d\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function resolveDriveViewUrlFromContext(ctx?: ImageDirectViewContext): string | null {
  if (!ctx) return null;
  const id =
    (typeof ctx.driveFileId === 'string' && ctx.driveFileId.trim()) ||
    (ctx.driveUrl ? extractGoogleDriveFileId(ctx.driveUrl) : null);
  if (id) return buildGoogleDriveViewUrl(id);
  const raw = typeof ctx.driveUrl === 'string' ? ctx.driveUrl.trim() : '';
  if (raw && isGoogleDriveFileViewUrl(raw)) return raw;
  return null;
}

/** Modal içi çerçeve adresi: önce Google önizleme URL’si, yoksa token proxy veya downloadUrl */
export function resolvePreparedModalFrameUrl(data: PreparedDownloadPayload): string | null {
  const iframePreview =
    typeof data.driveIframePreviewUrl === 'string' ? data.driveIframePreviewUrl.trim() : '';
  if (iframePreview) return iframePreview;
  if (data.downloadToken) {
    return `${apiFunctionsBase}/download-file/${data.downloadToken}`;
  }
  const du = typeof data.downloadUrl === 'string' ? data.downloadUrl.trim() : '';
  return du || null;
}

/**
 * Raster resimler: yalnızca Google Drive görüntüleme (/view).
 * /download-file veya usercontent indirme URL’si kullanılmaz.
 */
export function resolveImageDirectViewUrl(
  data: PreparedDownloadPayload,
  ctx?: ImageDirectViewContext,
): string | null {
  const viewFromApi =
    typeof data.driveImageViewUrl === 'string' ? data.driveImageViewUrl.trim() : '';
  if (viewFromApi) return viewFromApi;

  const fromCtx = resolveDriveViewUrlFromContext(ctx);
  if (fromCtx) return fromCtx;

  const drivePreview =
    typeof data.driveIframePreviewUrl === 'string' ? data.driveIframePreviewUrl.trim() : '';
  if (drivePreview && isGoogleDriveFileViewUrl(drivePreview)) return drivePreview;

  return null;
}

export async function openRasterImageDirectView(
  fileName: string,
  data: PreparedDownloadPayload,
  ctx?: ImageDirectViewContext,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const flagged =
    data.isImageEntry === true ||
    isBilgiImageEntry(ctx?.notification);
  if (!flagged && !looksLikeRasterImageFilename(fileName)) {
    return { ok: false };
  }
  const url = resolveImageDirectViewUrl(data, ctx);
  if (!url) {
    return { ok: false, error: 'Görüntüleme bağlantısı üretilemedi' };
  }
  if (isElectronShell()) {
    const opened = await openUrlInSystemBrowser(url);
    return opened.success
      ? { ok: true, url }
      : { ok: false, error: opened.error || 'Tarayıcı açılamadı' };
  }
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (!tab) {
    return { ok: false, error: 'Açılır pencere engellendi. Tarayıcıda açılır pencerelere izin verin.' };
  }
  return { ok: true, url };
}

/** «Bu resimdir» veya raster: Google Drive /view yeni sekmede (modal yok) */
export async function openGoogleDriveImageInNewTab(params: {
  fileName: string;
  notification?: string | null;
  driveFileId?: string | null;
  driveUrl?: string | null;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!shouldOpenAsGoogleDriveImage(params.fileName, params.notification)) {
    return { ok: false };
  }
  const url =
    resolveDriveViewUrlFromContext({
      driveFileId: params.driveFileId,
      driveUrl: params.driveUrl,
    }) || null;
  if (!url) {
    return { ok: false, error: 'Google Drive görüntüleme bağlantısı yok' };
  }
  return openRasterImageDirectView(
    params.fileName,
    { isImageEntry: true, driveImageViewUrl: url },
    { driveFileId: params.driveFileId, driveUrl: params.driveUrl, notification: params.notification },
  );
}

export function openDownloadPopupWindow(): Window | null {
  const popup = window.open('', 'ilsa_download_popup', 'width=520,height=340');
  if (!popup) return null;
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>İndirme Hazırlanıyor</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e5e7eb; }
          .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
          .card { width: 100%; max-width: 420px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 20px; }
          h1 { margin: 0 0 10px; font-size: 18px; }
          p { margin: 0; font-size: 14px; line-height: 1.4; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="card">
            <h1>İndirme hazırlanıyor...</h1>
            <p>Dosyanız güvenli bağlantı üzerinden başlatılıyor. Bu pencere otomatik yönlenecek.</p>
          </div>
        </div>
      </body>
    </html>
  `);
  popup.document.close();
  return popup;
}

function renderMaskedFrame(popup: Window, url: string): boolean {
  if (!popup || popup.closed) return false;
  try {
    popup.document.write(`
      <!doctype html>
      <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <meta name="referrer" content="no-referrer" />
          <title>Dosya Açılıyor</title>
          <style>
            html, body { margin: 0; width: 100%; height: 100%; background: #0b1020; overflow: hidden; }
            iframe { width: 100%; height: 100%; border: 0; display: block; }
            .loading {
              position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
              color: #fff; font: 500 14px/1.4 Arial, sans-serif; pointer-events: none;
            }
          </style>
        </head>
        <body>
          <iframe id="dl-frame" src="${url}" referrerpolicy="no-referrer"></iframe>
          <div class="loading" id="dl-loading">Dosya yükleniyor...</div>
          <script>
            (function () {
              var frame = document.getElementById('dl-frame');
              var loading = document.getElementById('dl-loading');
              function hideLoading() {
                if (loading) loading.style.display = 'none';
              }
              if (frame) {
                frame.addEventListener('load', hideLoading);
                window.setTimeout(hideLoading, 12000);
              }
            })();
            document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { passive: false });
            document.addEventListener('keydown', function (e) {
              var key = String(e.key || '').toUpperCase();
              var blocked =
                key === 'F12' ||
                (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) ||
                (e.ctrlKey && (key === 'U' || key === 'S'));
              if (blocked) e.preventDefault();
            });
          </script>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    return true;
  } catch {
    return false;
  }
}

function navigatePopup(popup: Window, url: string): boolean {
  if (!popup || popup.closed) return false;
  if (renderMaskedFrame(popup, url)) {
    return true;
  }
  try {
    popup.focus();
    popup.location.replace(url);
    return true;
  } catch {
    try {
      popup.location.href = url;
      return true;
    } catch {
      try {
        popup.document.write(
          `<!doctype html><html><body style="font-family:Arial;padding:16px">
             <p>Yönlendirme otomatik başlatılamadı.</p>
             <p><a href="${url}" target="_self" rel="noopener noreferrer">İndirmeyi başlat</a></p>
           </body></html>`,
        );
        popup.document.close();
        return false;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Backend’in ürettiği indirme cevabına göre tarayıcı indirmesini başlatır.
 * @returns true ise akış burada bitti (blob/proxy adımına gerek yok)
 */
export function startDownloadFromPreparePayload(
  data: PreparedDownloadPayload,
  existingPopup?: Window | null,
): boolean {
  if (data.downloadToken) {
    const url = `${apiFunctionsBase}/download-file/${data.downloadToken}`;
    if (isElectronShell()) {
      void openUrlInSystemBrowser(url);
      return true;
    }
    const popup = existingPopup ?? openDownloadPopupWindow();
    if (!popup) {
      return false;
    }

    setTimeout(() => {
      navigatePopup(popup, url);
    }, 200);
    return true;
  }
  if (data.useDirectDownload && data.downloadUrl) {
    if (isElectronShell()) {
      void openUrlInSystemBrowser(String(data.downloadUrl));
      return true;
    }
    const popup = existingPopup ?? openDownloadPopupWindow();
    if (!popup) return false;
    setTimeout(() => {
      navigatePopup(popup, data.downloadUrl as string);
    }, 200);
    return true;
  }
  return false;
}

/** Electron: modal iframe yerine hazır indirme URL’sini varsayılan tarayıcıda aç */
export async function openPreparedDownloadExternally(
  data: PreparedDownloadPayload,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (startDownloadFromPreparePayload(data)) {
    return {
      ok: true,
      message: isElectronShell()
        ? 'İndirme varsayılan tarayıcınızda (Chrome/Edge) başlatıldı.'
        : 'İndirme başlatıldı.',
    };
  }
  const frameUrl = resolvePreparedModalFrameUrl(data);
  if (frameUrl) {
    const opened = await openUrlInSystemBrowser(frameUrl);
    if (opened.success) {
      return {
        ok: true,
        message: isElectronShell()
          ? 'İndirme bağlantısı varsayılan tarayıcınızda açıldı.'
          : 'İndirme yeni sekmede açıldı.',
      };
    }
    return { ok: false, error: opened.error || 'Tarayıcı açılamadı' };
  }
  return { ok: false, error: 'İndirme bağlantısı üretilemedi' };
}

/**
 * Popup açmadan, token veya direkt URL üzerinden indirmeyi başlatır.
 * Link tarayıcı adres çubuğunda görünmez; indirme modal akışı içinde kalır.
 */
export async function startDownloadSilentlyFromPreparePayload(
  data: PreparedDownloadPayload,
  fallbackFileName?: string,
): Promise<boolean> {
  try {
    let targetUrl: string | null = null;
    if (data.downloadToken) {
      targetUrl = `${apiFunctionsBase}/download-file/${data.downloadToken}`;
    } else if (data.useDirectDownload && data.downloadUrl) {
      targetUrl = data.downloadUrl;
    }

    if (!targetUrl) return false;

    const response = await fetch(targetUrl);
    if (!response.ok) return false;

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = data.fileName || fallbackFileName || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch {
    return false;
  }
}
