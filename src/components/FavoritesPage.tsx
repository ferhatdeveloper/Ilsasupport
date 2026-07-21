import { useEffect, useState, useCallback } from 'react';
import { Star, ArrowLeft, Download, Lock, Trash2 } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { authenticatedFetch, getBearerForApi, isElectronShell } from '../utils/secureApi';
import { canDownloadFiles, openPremiumUpsell } from '../utils/membership';
import { useFavorites } from '../hooks/useFavorites';
import { FavoriteStarButton } from './FavoriteStarButton';
import { DownloadModal } from './DownloadModal';
import { Header } from './Header';
import { Footer } from './Footer';
import {
  getDownloadIframeFrameProps,
  looksLikeRasterImageFilename,
  openPreparedDownloadExternally,
  openGoogleDriveImageInNewTab,
  openRasterImageDirectView,
  resolvePreparedModalFrameUrl,
} from '../utils/startPreparedDownload';
import { shouldOpenAsGoogleDriveImage } from '../utils/bilgiImageFlag';
import { openUrlInSystemBrowser } from '../utils/electronBrowser';
import {
  buildGoogleDriveDirectDownloadUrl,
  buildGoogleDriveViewUrl,
  extractGoogleDriveFileId,
} from '../utils/googleDrive';
import '../styles/modern-pages.css';

type FavoriteRow = {
  fileId: string;
  fileName: string | null;
  meta?: { brandName?: string; categoryName?: string };
  driveFileId?: string | null;
  googleDriveLink?: string;
  driveWebViewUrl?: string;
  notification?: string | null;
  createdAt: string;
};

interface FavoritesPageProps {
  user: any;
  accessToken: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onBack: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onShowPremium: () => void;
  onShowProfile?: () => void;
  onShowDownloadHistory?: () => void;
  onShowLatestFiles?: () => void;
  onShowInfoPages?: () => void;
  onShowPackagePricing?: () => void;
  onShowFavorites?: () => void;
  onShowFileRequest?: () => void;
  onGoHome?: () => void;
  onShowAdmin?: () => void;
}

type ModalFile = {
  id: string;
  name: string;
  notification?: string | null;
  driveFileId?: string | null;
  driveUrl?: string;
};

const TXT_HINT =
  'Dosyaya t\u0131klayarak indirme penceresini a\u00e7abilir veya y\u0131ld\u0131zla favorilerden \u00e7\u0131karabilirsiniz.';
const TXT_EMPTY =
  'Hen\u00fcz favori dosyan\u0131z yok. Dosyalar\u0131n yan\u0131ndaki y\u0131ld\u0131za t\u0131klay\u0131n.';
const TXT_REMOVE = 'Kald\u0131r';
const TXT_DOWNLOAD = '\u0130ndir';
const TXT_DOWNLOAD_LOCKED = '\u0130ND\u0130RME';

export function FavoritesPage({
  user,
  accessToken,
  searchTerm,
  onSearchChange,
  onBack,
  onSignIn,
  onSignUp,
  onSignOut,
  onShowPremium,
  onShowProfile,
  onShowDownloadHistory,
  onShowLatestFiles,
  onShowInfoPages,
  onShowPackagePricing,
  onShowFavorites,
  onShowFileRequest,
  onGoHome,
  onShowAdmin,
}: FavoritesPageProps) {
  const [items, setItems] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const premium = canDownloadFiles(user, accessToken);
  const { toggleFavorite, load: reloadFavoriteIds } = useFavorites(accessToken);

  const [downloadModalFile, setDownloadModalFile] = useState<ModalFile | null>(null);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadFrameUrl, setDownloadFrameUrl] = useState<string | null>(null);

  const loadFavorites = async () => {
    if (!getBearerForApi(accessToken)) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${apiFunctionsBase}/favorites`, {}, accessToken);
      if (res.ok) {
        const data = await res.json();
        setItems(data.favorites || []);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, [accessToken]);

  useEffect(() => {
    if (!preparingDownload) return;
    setCountdown(30);
    const interval = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [preparingDownload]);

  const removeFavorite = async (item: FavoriteRow) => {
    if (removingId) return;
    setRemovingId(item.fileId);
    try {
      const r = await toggleFavorite(item.fileId, item.fileName || undefined, item.meta);
      if (r.needAuth) {
        onSignIn();
        return;
      }
      if (r.ok && !r.favorited) {
        setItems((prev) => prev.filter((x) => x.fileId !== item.fileId));
        if (downloadModalFile?.id === item.fileId) {
          setDownloadModalFile(null);
          setDownloadFrameUrl(null);
        }
        void reloadFavoriteIds();
      } else if (!r.ok) {
        alert(r.error || 'Favorilerden \u00e7\u0131kar\u0131lamad\u0131.');
      }
    } finally {
      setRemovingId(null);
    }
  };

  const hasDriveSource = (item: FavoriteRow) =>
    !!(item.driveFileId || item.driveWebViewUrl || item.googleDriveLink);

  const handleOpenDownload = async (item: FavoriteRow) => {
    if (!premium) {
      openPremiumUpsell(onShowPremium);
      return;
    }
    if (!hasDriveSource(item)) {
      alert('Bu dosya i\u00e7in indirme ba\u011flant\u0131s\u0131 bulunamad\u0131.');
      return;
    }

    const fileName = item.fileName || `Dosya #${item.fileId}`;
    if (shouldOpenAsGoogleDriveImage(fileName, item.notification)) {
      const opened = await openGoogleDriveImageInNewTab({
        fileName,
        notification: item.notification,
        driveFileId: item.driveFileId ?? null,
        driveUrl: item.driveWebViewUrl || item.googleDriveLink || '',
      });
      if (opened.ok) {
        void authenticatedFetch(
          `${apiFunctionsBase}/request-download?fileId=${item.fileId}`,
          { method: 'POST' },
          accessToken,
        ).catch(() => undefined);
        return;
      }
    }

    setDownloadModalFile({
      id: String(item.fileId),
      name: fileName,
      notification: item.notification,
      driveFileId: item.driveFileId ?? null,
      driveUrl: item.driveWebViewUrl || item.googleDriveLink || '',
    });
    setDownloadStatus('');
    setDownloadFrameUrl(null);
    setCountdown(30);
  };

  const applyDriveFallbackUrl = (file: ModalFile) => {
    const idFromUrl = file.driveUrl ? extractGoogleDriveFileId(file.driveUrl) : null;
    const driveId = file.driveFileId || idFromUrl;
    if (!driveId) return false;
    setDownloadFrameUrl(buildGoogleDriveDirectDownloadUrl(driveId));
    return true;
  };

  const startPreparedDownload = useCallback(async () => {
    const modalFile = downloadModalFile;
    if (!modalFile || !getBearerForApi(accessToken)) return;
    setPreparingDownload(true);
    try {
      const response = await authenticatedFetch(
        `${apiFunctionsBase}/request-download?fileId=${modalFile.id}`,
        { method: 'POST' },
        accessToken,
      );
      const data = await response.json();
      if (!response.ok) {
        if (data?.errorCode === 'LOGIN_REQUIRED') {
          setDownloadStatus(data?.error || 'Oturum ge\u00e7ersiz. Yeniden giri\u015f yap\u0131n.');
          onSignIn();
          return;
        }
        if (data?.errorCode === 'PREMIUM_REQUIRED' || String(data?.error || '').includes('Premium')) {
          openPremiumUpsell(onShowPremium);
          return;
        }
        if (data?.errorCode === 'DAILY_LIMIT_EXCEEDED') {
          alert(data?.error || 'G\u00fcnl\u00fck indirme limitiniz doldu.');
          return;
        }
        if (applyDriveFallbackUrl(modalFile)) {
          setDownloadStatus('\u0130ndirme fallback ile ba\u015flat\u0131ld\u0131.');
          return;
        }
        alert(data?.error || '\u0130ndirme haz\u0131rl\u0131\u011f\u0131 ba\u015far\u0131s\u0131z.');
        return;
      }
      if (
        data.isImageEntry ||
        shouldOpenAsGoogleDriveImage(modalFile.name, modalFile.notification)
      ) {
        const opened = await openRasterImageDirectView(modalFile.name, data, {
          driveFileId: modalFile.driveFileId,
          driveUrl: modalFile.driveUrl,
          notification: modalFile.notification,
        });
        if (opened.ok) {
          setDownloadModalFile(null);
          setDownloadFrameUrl(null);
          return;
        }
        const driveId =
          modalFile.driveFileId || extractGoogleDriveFileId(modalFile.driveUrl || '');
        const viewUrl = driveId ? buildGoogleDriveViewUrl(driveId) : null;
        if (viewUrl) {
          window.open(viewUrl, '_blank', 'noopener,noreferrer');
          setDownloadModalFile(null);
          setDownloadFrameUrl(null);
          return;
        }
        alert(opened.error || 'Resim Google Drive ba\u011flant\u0131s\u0131 a\u00e7\u0131lamad\u0131.');
        return;
      }

      if (isElectronShell()) {
        const ext = await openPreparedDownloadExternally(data);
        if (ext.ok) {
          setDownloadStatus(ext.message || '\u0130ndirme taray\u0131c\u0131da ba\u015flat\u0131ld\u0131.');
          return;
        }
        if (applyDriveFallbackUrl(modalFile)) {
          const driveId =
            modalFile.driveFileId || extractGoogleDriveFileId(modalFile.driveUrl || '');
          const driveUrl = driveId ? buildGoogleDriveDirectDownloadUrl(driveId) : null;
          if (driveUrl) {
            const opened = await openUrlInSystemBrowser(driveUrl);
            if (opened.success) {
              setDownloadStatus('\u0130ndirme varsay\u0131lan taray\u0131c\u0131da ba\u015flat\u0131ld\u0131.');
              return;
            }
          }
        }
        alert(ext.error || '\u0130ndirme taray\u0131c\u0131da a\u00e7\u0131lamad\u0131.');
        return;
      }

      const preparedUrl = resolvePreparedModalFrameUrl(data);
      if (preparedUrl) {
        setDownloadFrameUrl(preparedUrl);
        setDownloadStatus('\u0130ndirme ekran\u0131 modal i\u00e7inde a\u00e7\u0131ld\u0131.');
        return;
      }
      if (applyDriveFallbackUrl(modalFile)) {
        setDownloadStatus('\u0130ndirme fallback ile modal i\u00e7inde ba\u015flat\u0131ld\u0131.');
        return;
      }
      alert('\u0130ndirme ba\u015flat\u0131lamad\u0131.');
    } catch (error) {
      console.error('Favori indirme hatas\u0131:', error);
      alert('\u0130ndirme s\u0131ras\u0131nda bir hata olu\u015ftu.');
    } finally {
      setPreparingDownload(false);
    }
  }, [downloadModalFile, accessToken, onSignIn, onShowPremium]);

  const handleModalDownloadClick = useCallback(() => {
    void startPreparedDownload();
  }, [startPreparedDownload]);

  return (
    <div className="ilsa-page">
      <Header
        user={user}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onSignOut={onSignOut}
        onShowPremium={onShowPremium}
        onShowProfile={onShowProfile}
        onShowDownloadHistory={onShowDownloadHistory}
        onShowLatestFiles={onShowLatestFiles}
        onShowInfoPages={onShowInfoPages}
        onShowPackagePricing={onShowPackagePricing}
        onShowFavorites={onShowFavorites}
        onShowFileRequest={onShowFileRequest}
        onShowAdmin={onShowAdmin}
        onGoHome={onGoHome}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
      />

      <main className="ilsa-modern-shell py-8 px-4 max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Geri
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <Star className="w-7 h-7 fill-yellow-400 stroke-yellow-500 text-yellow-400" />
          Favorilerim
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Dosyaya t\u0131klayarak indirme penceresini a\u00e7abilir veya y\u0131ld\u0131zla favorilerden \u00e7\u0131karabilirsiniz.
        </p>

        {loading ? (
          <p className="text-gray-500">Y\u00fckleniyor\u2026</p>
        ) : items.length === 0 ? (
          <div className="ilsa-surface p-8 text-center text-gray-500">
            Hen\u00fcz favori dosyan\u0131z yok. Dosyalar\u0131n yan\u0131ndaki y\u0131ld\u0131za t\u0131klay\u0131n.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.fileId}
                className="ilsa-surface p-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-yellow-400 bg-gradient-to-r from-yellow-50/80 to-transparent dark:from-yellow-900/25 dark:to-transparent"
              >
                <button
                  type="button"
                  onClick={() => handleOpenDownload(item)}
                  className="flex items-start gap-3 min-w-0 flex-1 text-left rounded-lg hover:opacity-90 transition-opacity"
                  title={premium ? 'Dosyay\u0131 a\u00e7 / indir' : 'Premium gerekir'}
                >
                  <Star className="w-6 h-6 shrink-0 fill-yellow-400 stroke-yellow-500 text-yellow-400 mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white truncate">
                        {item.fileName || `Dosya #${item.fileId}`}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-yellow-400/25 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:text-yellow-200 ring-1 ring-yellow-400/50">
                        Favori
                      </span>
                    </div>
                    {item.meta?.brandName && (
                      <p className="text-sm text-gray-500 mt-1">
                        {String(item.meta.brandName)}
                        {item.meta.categoryName ? ` \u00b7 ${item.meta.categoryName}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(item.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <FavoriteStarButton
                    active
                    size="sm"
                    disabled={removingId === item.fileId}
                    onToggle={() => void removeFavorite(item)}
                  />
                  <button
                    type="button"
                    title="Favorilerden \u00e7\u0131kar"
                    disabled={removingId === item.fileId}
                    onClick={() => void removeFavorite(item)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {TXT_REMOVE}
                  </button>
                  <button
                    type="button"
                    title={premium ? 'Dosyay\u0131 indir' : 'Premium \u00fcyelik gerekir'}
                    disabled={!hasDriveSource(item)}
                    onClick={() => handleOpenDownload(item)}
                    className={`min-w-[110px] px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all ${
                      premium && hasDriveSource(item)
                        ? 'download-action-btn'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-60'
                    }`}
                  >
                    {premium ? (
                      <>
                        <Download className="w-4 h-4" />
                        {TXT_DOWNLOAD}
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        {TXT_DOWNLOAD_LOCKED}
                      </>
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />

      <DownloadModal
        isOpen={!!downloadModalFile}
        preparingDownload={preparingDownload}
        countdown={countdown}
        downloadStatus={downloadStatus}
        downloadFrameUrl={downloadFrameUrl}
        frameFileName={downloadModalFile?.name ?? null}
        externalBrowserHint={isElectronShell()}
        onClose={() => {
          setDownloadModalFile(null);
          setDownloadFrameUrl(null);
          setDownloadStatus('');
          setPreparingDownload(false);
        }}
        onStartDownload={handleModalDownloadClick}
        getFrameProps={getDownloadIframeFrameProps}
      />
    </div>
  );
}
