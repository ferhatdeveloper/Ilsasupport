import React, { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  looksLikeRasterImageFilename,
  shouldShowDownloadUrlInIframe,
} from '../utils/startPreparedDownload';

interface DownloadModalProps {
  isOpen: boolean;
  preparingDownload: boolean;
  countdown: number;
  downloadStatus: string;
  downloadFrameUrl: string | null;
  /** İndirilen dosya adı (resim uzantısı ise modal içinde önizleme) */
  frameFileName?: string | null;
  onClose: () => void;
  onStartDownload: () => void;
  getFrameProps: (url: string) => { src?: string; srcDoc?: string };
  /** Masaüstü kabuk: indirme varsayılan tarayıcıda açılır */
  externalBrowserHint?: boolean;
}

export function DownloadModal({
  isOpen,
  preparingDownload,
  countdown,
  downloadStatus,
  downloadFrameUrl,
  frameFileName,
  onClose,
  onStartDownload,
  getFrameProps,
  externalBrowserHint = false,
}: DownloadModalProps) {
  const [imgFallbackToIframe, setImgFallbackToIframe] = useState(false);
  const googleIframeShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgFallbackToIframe(false);
  }, [downloadFrameUrl]);

  /** Bağlantı hazırken «yükleniyor» paneli gösterme — önizleme ile çakışmasın */
  const showPreparingPanel = preparingDownload && !downloadFrameUrl;

  /** Google doğrudan iframe src: içerik cross-origin olduğu için içerdeki sağ tık tarayıcıya kalır; kabuk + capture ile mükmün olanlar */
  const activeGoogleIframeLeakGuard =
    isOpen &&
    Boolean(downloadFrameUrl && shouldShowDownloadUrlInIframe(downloadFrameUrl));

  useEffect(() => {
    if (!activeGoogleIframeLeakGuard) return;

    const blockIframeChromeShortcuts = (e: KeyboardEvent) => {
      const shell = googleIframeShellRef.current;
      if (!shell) return;

      const ae = document.activeElement;
      let guard = ae instanceof Node && shell.contains(ae);

      if (!guard) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const n = sel.anchorNode;
          if (n instanceof Node && shell.contains(n)) guard = true;
        }
      }

      if (!guard) return;

      const key = String(e.key || '').toUpperCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (ctrlOrMeta && ['C', 'X', 'A', 'U', 'S'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
      }
      if (ctrlOrMeta && e.shiftKey && ['I', 'J', 'C'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const blockShellContextMenu = (e: MouseEvent) => {
      const shell = googleIframeShellRef.current;
      if (!shell) return;
      const t = e.target;
      if (t instanceof Node && shell.contains(t)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', blockIframeChromeShortcuts, true);
    document.addEventListener('contextmenu', blockShellContextMenu, true);
    return () => {
      window.removeEventListener('keydown', blockIframeChromeShortcuts, true);
      document.removeEventListener('contextmenu', blockShellContextMenu, true);
    };
  }, [activeGoogleIframeLeakGuard]);

  if (!isOpen) return null;

  const frameProps = downloadFrameUrl ? getFrameProps(downloadFrameUrl) : {};
  const hasRealFrameSrc = Boolean(frameProps.src);

  /**
   * Raster uzantı + doğrudan yüklenebilir src (Google usercontent dahil): önce web `<img>` önizleme.
   * Google HTML/indir sayfası dönerse `onError` ile iframe’e düşer.
   */
  const useRasterImgPreview =
    Boolean(
      downloadFrameUrl &&
        frameFileName &&
        looksLikeRasterImageFilename(frameFileName) &&
        !imgFallbackToIframe &&
        hasRealFrameSrc,
    );

  /** Google «Yine de indir»: yalnızca iframe kullanılacaksa (raster önizleme yok) */
  const showGoogleIframeHint =
    Boolean(downloadFrameUrl && shouldShowDownloadUrlInIframe(downloadFrameUrl)) && !useRasterImgPreview;

  return (
    <div className="fixed inset-0 z-50 bg-blue-900/35 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-xl bg-white border-2 border-red-500 p-3 sm:p-4 flex flex-col overflow-hidden shadow-2xl">
        <h4 className="text-xl font-semibold text-gray-900 mb-1">İndirmeye hazır</h4>
        <p className="text-sm text-gray-700 mb-2">
          {externalBrowserHint
            ? 'İndirme hazırlandığında dosya varsayılan tarayıcınızda (Chrome/Edge) açılır; uygulama içi önizleme kullanılmaz.'
            : 'Dosya Google ara sayfasına gitmeden, bu sayfada tarayıcı indirmesi olarak başlatılacak.'}{' '}
          Büyük dosyalarda hazırlanma süresi 10-30 saniye sürebilir.
          {frameFileName && looksLikeRasterImageFilename(frameFileName) ? (
            <span className="block mt-1 text-gray-600">
              Görsel dosyalar «Görüntüle» ile Google Drive önizleme sayfasında açılır (doğrudan indirme değil).
            </span>
          ) : useRasterImgPreview ? (
            <span className="block mt-1 text-gray-600">
              Görsel önizleme aşağıda; kaydetmek için «İndir»e basın.
            </span>
          ) : null}
        </p>

        {showPreparingPanel && (
          <p className="text-sm font-medium text-red-600 mb-4">
            Hazırlanıyor... {countdown}s
          </p>
        )}

        {!showPreparingPanel && downloadStatus && (
          <p className="text-sm font-medium text-green-600 mb-4">
            {downloadStatus}
          </p>
        )}

        {showGoogleIframeHint && !externalBrowserHint ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-2 leading-snug">
            Google sayfasında <strong>Yine de indir</strong> görünüyorsa ona basın. Görünmüyorsa tekrar{' '}
            <strong>İndir</strong>e basabilirsiniz.
          </p>
        ) : null}

        <div className="flex gap-3 mb-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium transition-colors"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={onStartDownload}
            disabled={preparingDownload}
            className="download-action-btn flex-1 py-3 rounded-lg font-semibold shadow transition-colors inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>
              {preparingDownload
                ? 'Hazırlanıyor...'
                : frameFileName && looksLikeRasterImageFilename(frameFileName)
                  ? downloadFrameUrl
                    ? 'Yeniden aç'
                    : 'Görüntüle'
                  : downloadFrameUrl
                    ? 'Yeniden hazırla'
                    : 'İndir'}
            </span>
          </button>
        </div>

        {showPreparingPanel && (
          <div className="mt-1 rounded-lg border-2 border-red-300 bg-red-50/60 p-6">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-8 w-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-red-700">
                Link oluşturuluyor, lütfen bekleyin...
              </p>
              <p className="text-xs text-gray-600">
                Dosya indirme bağlantısı hazırlanıyor. Bu işlem birkaç saniye sürebilir.
              </p>
            </div>
          </div>
        )}

        {downloadFrameUrl && !externalBrowserHint && (
          <div
            ref={googleIframeShellRef}
            className={`mt-1 rounded-lg border-2 border-red-500 bg-white${
              downloadFrameUrl && shouldShowDownloadUrlInIframe(downloadFrameUrl)
                ? ' select-none'
                : ''
            }`}
            style={{
              overflow: 'hidden',
              height: '500px',
              minHeight: '280px',
            }}
            onContextMenu={(e) => e.preventDefault()}
            onCopy={(e) => {
              if (downloadFrameUrl && shouldShowDownloadUrlInIframe(downloadFrameUrl)) {
                e.preventDefault();
              }
            }}
            onCut={(e) => {
              if (downloadFrameUrl && shouldShowDownloadUrlInIframe(downloadFrameUrl)) {
                e.preventDefault();
              }
            }}
          >
            {useRasterImgPreview ? (
              <img
                src={frameProps.src as string}
                alt={frameFileName || 'Önizleme'}
                referrerPolicy="no-referrer"
                className="mx-auto block max-h-[min(70vh,500px)] w-full object-contain bg-zinc-50"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onError={() => setImgFallbackToIframe(true)}
              />
            ) : (
              <iframe
                {...frameProps}
                title="İndirme çerçevesi"
                referrerPolicy="no-referrer"
                scrolling="yes"
                sandbox="allow-downloads allow-forms allow-scripts allow-popups"
                style={{
                  transform: 'translateY(-50px)',
                  width: '100%',
                  height: '800px',
                  border: 0,
                }}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
