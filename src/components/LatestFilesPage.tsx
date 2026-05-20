import { useState, useEffect, useCallback } from 'react';
import { Download, FileText, Grid3x3, List, Clock, BarChart2, Lock } from 'lucide-react';
import { FavoriteStarButton } from './FavoriteStarButton';
import { canDownloadFiles, openPremiumUpsell } from '../utils/membership';
import { useFavorites } from '../hooks/useFavorites';
import { motion } from 'motion/react';
import { apiFunctionsBase } from '../utils/supabase/info';
import {
  authenticatedFetch,
  getBearerForApi,
  isLoggedIn,
} from '../utils/secureApi';
import { AdminDownloadersModal } from './AdminDownloadersModal';
import {
  getDownloadIframeFrameProps,
  looksLikeRasterImageFilename,
  openPreparedDownloadExternally,
  resolvePreparedModalFrameUrl,
  shouldForceIframeDriveDownloadFlow,
} from '../utils/startPreparedDownload';
import { openUrlInSystemBrowser } from '../utils/electronBrowser';
import { isElectronShell } from '../utils/secureApi';
import { DownloadModal } from './DownloadModal';
import { buildGoogleDriveDirectDownloadUrl, extractGoogleDriveFileId } from '../utils/googleDrive';
import { fetchBrandMarkaPaths, resolveDirectoryIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';
import '../styles/modern-pages.css';

interface LatestFilesPageProps {
  user: any | null;
  accessToken: string | null;
  onBack: () => void;
  onShowPremium: () => void;
  onShowAuth: () => void;
}

interface FileItem {
  id: string;
  name: string;
  description: string;
  size?: number | string | null;
  downloadCount?: number;
  createdAt: string;
  brandId?: string | null;
  brandName?: string;
  brandIcon?: string;
  categoryName?: string;
  subcategoryName?: string;
  driveFileId?: string | null;
  googleDriveLink?: string;
  driveWebViewUrl?: string;
}

function formatSizeMb(bytes: unknown): string {
  const n = typeof bytes === 'number' ? bytes : parseFloat(String(bytes ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 'Boyut bilinmiyor';
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function getLegacyInfoText(file: FileItem, showDownloadHint: boolean): string {
  const infoText = file.description != null ? String(file.description).trim() : '';
  if (infoText) return infoText;
  const rawSize = file.size != null ? String(file.size).trim() : '';
  if (rawSize) return rawSize;
  const mb = formatSizeMb(file.size);
  if (mb !== 'Boyut bilinmiyor') return mb;
  return showDownloadHint ? 'İNDİRİN' : '—';
}

export function LatestFilesPage({ user, accessToken, onBack, onShowPremium, onShowAuth }: LatestFilesPageProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list'); // Varsayılan: list
  const [downloadModalFile, setDownloadModalFile] = useState<{
    id: string;
    name: string;
    driveFileId?: string | null;
    driveUrl?: string;
  } | null>(null);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadFrameUrl, setDownloadFrameUrl] = useState<string | null>(null);
  const [downloadersModal, setDownloadersModal] = useState<{ id: string; name: string } | null>(null);
  const [markaPaths, setMarkaPaths] = useState<BrandMarkaPaths | null>(null);
  const isAdmin = user?.role === 'admin';

  const getBrandLabel = (file: FileItem) => file.brandName || file.categoryName || '';
  const isSameLabel = (a?: string | null, b?: string | null) =>
    (a || '').trim().toLocaleUpperCase('tr-TR') === (b || '').trim().toLocaleUpperCase('tr-TR');

  const normalizeBrandKey = (value?: string) =>
    (value || '')
      .trim()
      .toLocaleUpperCase('tr-TR')
      .replace(/\s+/g, ' ')
      .replace(/I/g, 'İ');

  const getBrandLogoSrc = (file: FileItem) => {
    const brandLabel = getBrandLabel(file);

    if (typeof file.brandIcon === 'string') {
      const direct = file.brandIcon.trim();
      if (direct.startsWith('/img/')) return direct;
    }

    if (!brandLabel) return '';
    const src = resolveDirectoryIconForGrid(brandLabel, file.brandIcon, markaPaths, brandLabel);
    if (typeof src === 'string') {
      const trimmed = src.trim();
      if (trimmed.startsWith('/img/')) return trimmed;
    }

    const key = normalizeBrandKey(brandLabel);
    const manualMap: Record<string, string> = {
      'XİAOMİ': '/img/marka/mi.png',
      'SAMSUNG': '/img/marka/samsung.png',
      'İPHONE': '/img/marka/iphone.png',
      'HUAWEİ': '/img/marka/huawei.png',
    };

    return manualMap[key] || '';
  };

  useEffect(() => {
    if (!preparingDownload) return;
    setCountdown(30);
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [preparingDownload]);

  useEffect(() => {
    loadLatestFiles();
  }, [accessToken]);

  useEffect(() => {
    fetchBrandMarkaPaths().then(setMarkaPaths);
  }, []);

  const loadLatestFiles = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch(
        `${apiFunctionsBase}/latest-files?limit=50`,
        {},
        accessToken,
      );

      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('En yeni dosyalar yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  /** İstemci tarafında kontrol et ve indirme onay modalını aç */
  const mayDownload = canDownloadFiles(user, accessToken);
  const { isFavorite, toggleFavorite } = useFavorites(accessToken);

  const handleOpenGoogleDrive = async (file: FileItem) => {
    if (!isLoggedIn(user, accessToken)) {
      onShowAuth();
      return;
    }
    if (!mayDownload) {
      openPremiumUpsell(onShowPremium);
      return;
    }

    const hasDriveSource = !!(file.driveFileId || file.driveWebViewUrl || file.googleDriveLink);
    if (!hasDriveSource) {
      alert('Bu dosya için Google Drive linki yok.');
      return;
    }

    setDownloadModalFile({
      id: String(file.id),
      name: file.name,
      driveFileId: typeof file.driveFileId === 'string' ? file.driveFileId : null,
      driveUrl: file.driveWebViewUrl || file.googleDriveLink || '',
    });
    setDownloadStatus('');
    setDownloadFrameUrl(null);
    setCountdown(30);
  };

  type ModalFileShape = NonNullable<typeof downloadModalFile>;

  const applyDriveFallbackUrl = (file: ModalFileShape) => {
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
          setDownloadStatus(
            data?.error ||
              'Oturum geçersiz. Masaüstünden «Tarayıcıdan devam et» ile yeniden giriş yapın, sonra İndir’e basın.',
          );
          onShowAuth();
          return;
        }
        if (data?.errorCode === 'PREMIUM_REQUIRED' || String(data?.error || '').includes('Premium')) {
          openPremiumUpsell(onShowPremium);
          return;
        }
        if (data?.errorCode === 'DAILY_LIMIT_EXCEEDED') {
          alert(data?.error || 'Günlük indirme limitiniz doldu.');
          return;
        }
        if (applyDriveFallbackUrl(modalFile)) {
          setDownloadStatus('İndirme fallback ile başlatıldı. Lütfen tarayıcı indirmelerini kontrol edin.');
          return;
        }
        alert(data?.error || 'İndirme hazırlığı başarısız.');
        return;
      }
      if (isElectronShell()) {
        const ext = await openPreparedDownloadExternally(data);
        if (ext.ok) {
          setDownloadStatus(ext.message || 'İndirme tarayıcıda başlatıldı.');
          return;
        }
        if (applyDriveFallbackUrl(modalFile)) {
          const driveId =
            modalFile.driveFileId || extractGoogleDriveFileId(modalFile.driveUrl || '');
          const driveUrl = driveId ? buildGoogleDriveDirectDownloadUrl(driveId) : null;
          if (driveUrl) {
            const opened = await openUrlInSystemBrowser(driveUrl);
            if (opened.success) {
              setDownloadStatus('İndirme varsayılan tarayıcınızda başlatıldı.');
              return;
            }
          }
        }
        alert(ext.error || 'İndirme tarayıcıda açılamadı.');
        return;
      }

      const preparedUrl = resolvePreparedModalFrameUrl(data);

      if (preparedUrl) {
        setDownloadFrameUrl(preparedUrl);
        setDownloadStatus(
          looksLikeRasterImageFilename(modalFile.name)
            ? 'Resim modal içinde önizleniyor; kalıcı indirme için «İndir»e basın.'
            : 'İndirme ekranı modal içinde açıldı.',
        );
        return;
      }

      if (applyDriveFallbackUrl(modalFile)) {
        setDownloadStatus(
          looksLikeRasterImageFilename(modalFile.name)
            ? 'Resim önizlemesi için bağlantı açıldı; gerekirse «İndir»e basın.'
            : 'İndirme fallback ile modal içinde başlatıldı.',
        );
        return;
      }
      alert('İndirme başlatılamadı. Lütfen tekrar deneyin.');
    } catch (error) {
      console.error('İndirme hazırlığı hatası:', error);
      alert('İndirme sırasında bir hata oluştu.');
    } finally {
      setPreparingDownload(false);
    }
  }, [downloadModalFile, accessToken, onShowAuth, onShowPremium]);

  const handleModalDownloadClick = useCallback(() => {
    if (isElectronShell()) {
      void startPreparedDownload();
      return;
    }
    if (
      downloadFrameUrl &&
      downloadModalFile &&
      looksLikeRasterImageFilename(downloadModalFile.name) &&
      !shouldForceIframeDriveDownloadFlow(downloadFrameUrl)
    ) {
      window.open(downloadFrameUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    void startPreparedDownload();
  }, [downloadFrameUrl, downloadModalFile, startPreparedDownload]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Az önce';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} saat önce`;
    } else if (diffInHours < 48) {
      return 'Dün';
    } else {
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  };

  const handleTickerFileClick = (fileName: string) => {
    // Tıklanan dosyayı bul ve scroll et
    const fileElement = document.getElementById(`file-${fileName}`);
    if (fileElement) {
      fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Kısa bir highlight efekti
      fileElement.classList.add('ring-2', 'ring-purple-500');
      setTimeout(() => {
        fileElement.classList.remove('ring-2', 'ring-purple-500');
      }, 2000);
    }
  };

  return (
    <div className="ilsa-page ilsa-page-home-compat">
      <div className="ilsa-page-container">
        <div className="ilsa-surface mb-6 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-400 mb-1">
            ILSA Support Platform
          </p>
          <h1 className="ilsa-title text-2xl sm:text-3xl font-bold tracking-tight">
            En Yeni Dosyalar
          </h1>
          <p className="ilsa-muted mt-2 text-sm">
            Son eklenen dosyalari tek sayfada inceleyin, liste veya grid gorunumuyle hizlica indirime gecin.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="ilsa-surface rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wide ilsa-muted">Toplam dosya</p>
            <p className="mt-1 text-xl font-semibold ilsa-title">{files.length}</p>
          </div>
          <div className="ilsa-surface rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wide ilsa-muted">Yeni etiketi</p>
            <p className="mt-1 text-xl font-semibold ilsa-title">{Math.min(files.length, 5)}</p>
          </div>
          <div className="ilsa-surface rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wide ilsa-muted">Gorunum</p>
            <p className="mt-1 text-xl font-semibold ilsa-title">{viewMode === 'list' ? 'Liste' : 'Grid'}</p>
          </div>
        </div>

        {/* Header with Back Button and View Toggle */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <button
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <span>←</span>
              <span>Ana Sayfaya Dön</span>
            </button>
            <h2 className="ilsa-title text-2xl font-bold tracking-tight">Liste</h2>
          </div>

          {/* View Mode Toggle */}
          <div className="ilsa-surface flex items-center gap-2 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                viewMode === 'list'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'ilsa-muted hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="font-semibold">Liste</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                viewMode === 'grid'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'ilsa-muted hover:text-white'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
              <span className="font-semibold">Grid</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={`latest-skeleton-${idx}`} className="ilsa-surface rounded-lg p-4">
                <div className="h-4 w-1/3 rounded bg-white/10 mb-3"></div>
                <div className="h-3 w-2/3 rounded bg-white/10 mb-2"></div>
                <div className="h-3 w-1/2 rounded bg-white/10"></div>
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-gray-900 text-xl mb-2">Henüz Dosya Yok</h3>
            <p className="text-gray-600">Yakında yeni dosyalar eklenecek</p>
          </div>
        ) : viewMode === 'list' ? (
          // LIST VIEW
          <div className="space-y-3">
            {files.map((file, index) => (
              <motion.div
                key={file.id}
                id={`file-${file.name}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.01 }}
                className="ilsa-surface p-4 transition-all hover:border-red-500/60"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-16 h-16 shrink-0 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {getBrandLogoSrc(file) ? (
                        <img
                          src={getBrandLogoSrc(file)}
                          alt={`${getBrandLabel(file)} logo`}
                          className="w-[52px] h-[52px] object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xl text-purple-600">📱</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="ilsa-title truncate font-semibold tracking-tight mb-1">{file.name}</h3>

                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {index < 5 && (
                          <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-2 py-0.5 rounded text-[10px] uppercase font-semibold">
                            Yeni
                          </span>
                        )}
                        {file.categoryName && !isSameLabel(file.categoryName, getBrandLabel(file)) && (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold">
                            {file.categoryName}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs ilsa-muted font-medium">
                        <span className="font-bold" style={{ color: '#000000' }}>
                          Tarih: {new Date(file.createdAt).toLocaleString('tr-TR')}
                        </span>
                        <span className="text-gray-400">|</span>
                        <span className="font-extrabold" style={{ color: '#dc2626' }}>
                          Bilgi: {getLegacyInfoText(file, !!accessToken)}
                        </span>
                        {isAdmin && accessToken ? <span className="text-gray-400">|</span> : null}
                        {isAdmin && accessToken ? (
                          <button
                            type="button"
                            title="Kim indirdi — listeyi aç"
                            className="inline-flex items-center gap-1 text-red-800 font-extrabold hover:underline"
                            onClick={() => setDownloadersModal({ id: String(file.id), name: file.name })}
                          >
                            <BarChart2 className="w-3 h-3" />
                            {file.downloadCount ?? 0}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {isLoggedIn(user, accessToken) ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <FavoriteStarButton
                        active={isFavorite(file.id)}
                        onToggle={() =>
                          void toggleFavorite(file.id, file.name, {
                            brandName: file.brandName,
                            categoryName: file.categoryName,
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!mayDownload) openPremiumUpsell(onShowPremium);
                          else void handleOpenGoogleDrive(file);
                        }}
                        className={`min-w-[126px] px-5 py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${
                          mayDownload ? 'download-action-btn' : 'bg-gray-600 text-gray-200'
                        }`}
                      >
                        {mayDownload ? (
                          <>
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline font-semibold tracking-tight">İndir</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span className="hidden sm:inline font-semibold tracking-tight">İNDİRME</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          // GRID VIEW
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file, index) => (
              <motion.div
                key={file.id}
                id={`file-${file.name}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: index * 0.01 }}
                className="ilsa-surface p-4 transition-all hover:border-red-500/60"
              >
                <div className="mb-3">
                  {index < 5 && (
                    <span className="inline-block bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-2 py-0.5 rounded text-xs uppercase mb-2">
                      Yeni
                    </span>
                  )}
                  <h3 className="ilsa-title line-clamp-2 mb-2 font-semibold tracking-tight">{file.name}</h3>
                  {getBrandLabel(file) && (
                    <div className="mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-50 text-purple-700 ring-1 ring-purple-200 text-xs">
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-white overflow-hidden">
                          {getBrandLogoSrc(file) ? (
                            <img
                              src={getBrandLogoSrc(file)}
                              alt={`${getBrandLabel(file)} logo`}
                              className="w-3.5 h-3.5 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px]">📱</span>
                          )}
                        </span>
                        <span className="truncate max-w-[140px]">{getBrandLabel(file)}</span>
                      </span>
                    </div>
                  )}
                  {file.description && (
                    <p className="text-gray-600 text-sm line-clamp-2 mb-3 font-medium">{file.description}</p>
                  )}
                </div>

                <div className="space-y-2 mb-4 text-sm text-gray-600 font-medium">
                  {getBrandLabel(file) && (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const logoSrc = getBrandLogoSrc(file);
                        return (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-gray-200 overflow-hidden">
                            {logoSrc ? (
                              <img
                                src={logoSrc}
                                alt={`${getBrandLabel(file)} logo`}
                                className="w-4 h-4 object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <span className="text-[10px] text-purple-600">📱</span>
                            )}
                          </span>
                        );
                      })()}
                      <span className="truncate">{getBrandLabel(file)}</span>
                    </div>
                  )}
                  {file.categoryName && (
                    <div className="flex items-center gap-2">
                      <span className="text-pink-600">📂</span>
                      <span className="truncate">{file.categoryName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>💾</span>
                    <span>{getLegacyInfoText(file, !!accessToken)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(file.createdAt)}</span>
                  </div>
                </div>

                {isLoggedIn(user, accessToken) ? (
                  <div className="flex gap-2">
                    <FavoriteStarButton
                      active={isFavorite(file.id)}
                      onToggle={() =>
                        void toggleFavorite(file.id, file.name, {
                          brandName: file.brandName,
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!mayDownload) openPremiumUpsell(onShowPremium);
                        else void handleOpenGoogleDrive(file);
                      }}
                      className={`flex-1 px-4 py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${
                        mayDownload ? 'download-action-btn' : 'bg-gray-600 text-gray-200'
                      }`}
                    >
                      {mayDownload ? (
                        <>
                          <Download className="w-4 h-4" />
                          <span className="font-semibold tracking-tight">İndir</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span className="font-semibold tracking-tight">İNDİRME</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AdminDownloadersModal
        open={!!downloadersModal}
        fileId={downloadersModal?.id ?? ''}
        fileName={downloadersModal?.name ?? ''}
        accessToken={accessToken}
        onClose={() => setDownloadersModal(null)}
      />

      <DownloadModal
        isOpen={!!downloadModalFile}
        preparingDownload={preparingDownload}
        countdown={countdown}
        downloadStatus={downloadStatus}
        downloadFrameUrl={downloadFrameUrl}
        onClose={() => {
          setDownloadModalFile(null);
          setDownloadFrameUrl(null);
        }}
        frameFileName={downloadModalFile?.name ?? null}
        externalBrowserHint={isElectronShell()}
        onStartDownload={handleModalDownloadClick}
        getFrameProps={getDownloadIframeFrameProps}
      />
    </div>
  );
}