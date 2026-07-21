import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, BarChart2, ChevronRight, Crown, Download } from 'lucide-react';
import { FavoriteStarButton } from './FavoriteStarButton';
import { canDownloadFiles, openPremiumUpsell } from '../utils/membership';
import { useFavorites } from '../hooks/useFavorites';
import { apiFunctionsBase } from '../utils/supabase/info';
import {
  authenticatedFetch,
  getBearerForApi,
  isLoggedIn,
} from '../utils/secureApi';
import { readResponseJson } from '../utils/readResponseJson';
import { AdminDownloadersModal } from './AdminDownloadersModal';
import {
  buildGoogleDriveDirectDownloadUrl,
  buildGoogleDriveViewUrl,
  extractGoogleDriveFileId,
} from '../utils/googleDrive';
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
import { isElectronShell } from '../utils/secureApi';
import { GridIconMedia } from './GridIconMedia';
import { DownloadModal } from './DownloadModal';
import { fetchBrandMarkaPaths, resolveDirectoryIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';
import '../styles/modern-pages.css';

interface FileListProps {
  brandId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  searchTerm: string;
  user: any | null;
  accessToken: string | null;
  onShowAuth: () => void;
  onShowPremium: () => void;
  onSearchChange?: (term: string) => void;
  onBack?: () => void;
  /** PHP ara.wizard dizin tıklanınca marka/kategori ağacına git */
  onNavigateFromSearch?: (nav: {
    brandId: string;
    categoryId: string | null;
    subcategoryId: string | null;
    path?: Array<{ id: string; name: string }>;
  }) => void;
}

export function FileList({
  brandId,
  categoryId,
  subcategoryId,
  searchTerm,
  user,
  accessToken,
  onShowAuth,
  onShowPremium,
  onSearchChange,
  onBack,
  onNavigateFromSearch,
}: FileListProps) {
  const [files, setFiles] = useState([] as any[]);
  /** Sunucu aramasından gelen klasör kartları */
  const [araFolders, setAraFolders] = useState([] as any[]);
  const [loading, setLoading] = useState(true);
  const [downloadModalFile, setDownloadModalFile] = useState(null as {
    id: string;
    name: string;
    notification?: string | null;
    driveFileId?: string | null;
    driveUrl?: string;
  } | null);
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadFrameUrl, setDownloadFrameUrl] = useState(null as string | null);
  const [downloadersModal, setDownloadersModal] = useState(null as { id: string; name: string } | null);
  const [markaPaths, setMarkaPaths] = useState(null as BrandMarkaPaths | null);
  const isAdmin = user?.role === 'admin';
  const mayDownload = canDownloadFiles(user, accessToken);
  const { isFavorite, toggleFavorite } = useFavorites(accessToken);

  const [listPage, setListPage] = useState(1);
  const [listTotalFiles, setListTotalFiles] = useState(0);
  const [listTotalPages, setListTotalPages] = useState(0);
  const [listFetchError, setListFetchError] = useState('');
  const listFiltersKey = `${brandId ?? ''}|${categoryId ?? ''}|${subcategoryId ?? ''}|${searchTerm.trim()}`;
  const lastListKeyRef = useRef<string | null>(null);

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
    fetchBrandMarkaPaths().then(setMarkaPaths);
  }, []);

  const formatCreatedAt = (createdAt?: string) => {
    if (!createdAt) return 'Tarih yok';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return 'Tarih yok';
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const normalizeSearchText = (value: unknown) =>
    String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/i̇/g, 'i')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/I/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const getMatchedFolders = (items: any[], rawSearchTerm: string) => {
    const term = normalizeSearchText(rawSearchTerm);
    if (!term) return [] as Array<{ type: 'Marka' | 'Kategori' | 'Alt Kategori'; name: string; icon?: string | null }>;

    const seen = new Set<string>();
    const matched: Array<{ type: 'Marka' | 'Kategori' | 'Alt Kategori'; name: string; icon?: string | null }> = [];

    const pushIfMatch = (
      type: 'Marka' | 'Kategori' | 'Alt Kategori',
      rawValue?: string,
      icon?: string | null,
    ) => {
      const name = String(rawValue || '').trim();
      const normalized = normalizeSearchText(name);
      if (!normalized || !normalized.includes(term)) return;
      const key = `${type}::${normalized}`;
      if (seen.has(key)) return;
      seen.add(key);
      matched.push({ type, name, icon: icon || null });
    };

    for (const file of items) {
      pushIfMatch('Marka', file.brandName, file.brandIcon);
      pushIfMatch('Kategori', file.categoryName, file.categoryIcon);
      pushIfMatch('Alt Kategori', file.subcategoryName, file.subcategoryIcon || file.categoryIcon);
    }

    matched.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return matched;
  };

  useEffect(() => {
    const keyChanged = lastListKeyRef.current !== listFiltersKey;
    if (keyChanged) {
      lastListKeyRef.current = listFiltersKey;
      if (listPage !== 1) {
        setListPage(1);
        return;
      }
    }

    const pageForRequest = keyChanged ? 1 : listPage;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setListFetchError('');
      try {
        const term = normalizeSearchText(searchTerm);
        if (term) {
          const params = new URLSearchParams({
            q: searchTerm.trim(),
            page: String(pageForRequest),
          });
          const response = await authenticatedFetch(
            `${apiFunctionsBase}/search?${params}`,
            {},
            accessToken,
          );
          if (!cancelled && response.ok) {
            const data = await readResponseJson<{
              folders?: unknown[];
              files?: unknown[];
              totalFiles?: number;
              totalPages?: number;
              userPlan?: string;
            }>(response);
            setAraFolders(Array.isArray(data.folders) ? data.folders : []);
            setFiles(Array.isArray(data.files) ? [...data.files] : []);
            const tfSearch = Number(data.totalFiles) || 0;
            setListTotalFiles(tfSearch);
            setListTotalPages(
              typeof data.totalPages === 'number'
                ? data.totalPages
                : tfSearch > 0
                  ? Math.ceil(tfSearch / 100)
                  : 0,
            );
            console.log(
              `🔎 Arama: ${(data.folders || []).length} klasör, sayfa ${pageForRequest} (Plan: ${data.userPlan})`,
            );
          } else if (!cancelled) {
            const errBody = await readResponseJson<{ error?: string; detail?: string }>(response);
            const msg = [errBody.error, errBody.detail].filter(Boolean).join(' — ') || `HTTP ${response.status}`;
            setListFetchError(msg);
            setAraFolders([]);
            setFiles([]);
            setListTotalFiles(0);
            setListTotalPages(0);
          }
          return;
        }

        if (!cancelled) {
          setAraFolders([]);
        }
        const params = new URLSearchParams({ page: String(pageForRequest) });
        if (brandId) params.append('brandId', brandId);
        if (categoryId) params.append('categoryId', categoryId);
        if (subcategoryId) params.append('subcategoryId', subcategoryId);
        const response = await authenticatedFetch(
          `${apiFunctionsBase}/files-filtered?${params}`,
          {},
          accessToken,
        );

        if (!cancelled && response.ok) {
          const data = await readResponseJson<{
            files?: unknown[];
            totalFiles?: number;
            totalPages?: number;
            userPlan?: string;
          }>(response);
          const nextFiles = Array.isArray(data.files) ? [...data.files] : [];
          setFiles(nextFiles);
          const tf = Number(data.totalFiles) || 0;
          setListTotalFiles(tf);
          setListTotalPages(
            typeof data.totalPages === 'number' ? data.totalPages : tf > 0 ? Math.ceil(tf / 100) : 0,
          );
          console.log(`📁 Sayfa ${pageForRequest}, ${nextFiles.length} kayıt (Plan: ${data.userPlan})`);
        } else if (!cancelled && !response.ok) {
          const errBody = await readResponseJson<{ error?: string; detail?: string }>(response);
          const msg = [errBody.error, errBody.detail].filter(Boolean).join(' — ') || `HTTP ${response.status}`;
          setListFetchError(msg);
          setFiles([]);
          setListTotalFiles(0);
          setListTotalPages(0);
        }
      } catch (error) {
        console.error('Dosya yükleme hatası:', error);
        if (!cancelled) {
          setListFetchError(error instanceof Error ? error.message : 'Ağ veya sunucu hatası');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listFiltersKey, listPage, accessToken]);

  /** Erişim kontrolünden sonra indirme onay modalını aç */
  const handleOpenGoogleDrive = async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;

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
      alert('Bu kayıt için Drive linki tanımlı değil.');
      return;
    }

    if (shouldOpenAsGoogleDriveImage(file.name, file.notification)) {
      const opened = await openGoogleDriveImageInNewTab({
        fileName: file.name,
        notification: file.notification,
        driveFileId: typeof file.driveFileId === 'string' ? file.driveFileId : null,
        driveUrl: file.driveWebViewUrl || file.googleDriveLink || '',
      });
      if (opened.ok) {
        void authenticatedFetch(
          `${apiFunctionsBase}/request-download?fileId=${file.id}`,
          { method: 'POST' },
          accessToken,
        ).catch(() => undefined);
        return;
      }
    }

    setDownloadModalFile({
      id: file.id,
      name: file.name,
      notification: file.notification,
      driveFileId: typeof file.driveFileId === 'string' ? file.driveFileId : null,
      driveUrl: file.driveWebViewUrl || file.googleDriveLink || '',
    });
    setDownloadStatus('');
    setDownloadFrameUrl(null);
    setCountdown(30);
  };

  type ModalFileShape = NonNullable<typeof downloadModalFile>;

  const resolveDriveDirectDownloadUrl = (file: ModalFileShape): string | null => {
    const idFromUrl = file.driveUrl ? extractGoogleDriveFileId(file.driveUrl) : null;
    const driveId = file.driveFileId || idFromUrl;
    if (!driveId) return null;
    return buildGoogleDriveDirectDownloadUrl(driveId);
  };

  const applyDriveFallbackUrl = (file: ModalFileShape) => {
    const driveDownloadUrl = resolveDriveDirectDownloadUrl(file);
    if (!driveDownloadUrl) return false;
    setDownloadFrameUrl(driveDownloadUrl);
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
        alert(opened.error || 'Resim Google Drive bağlantısı açılamadı.');
        return;
      }

      if (isElectronShell()) {
        const ext = await openPreparedDownloadExternally(data);
        if (ext.ok) {
          setDownloadStatus(ext.message || 'İndirme tarayıcıda başlatıldı.');
          return;
        }
        const driveUrl = resolveDriveDirectDownloadUrl(modalFile);
        if (driveUrl) {
          const opened = await openUrlInSystemBrowser(driveUrl);
          if (opened.success) {
            setDownloadStatus('İndirme varsayılan tarayıcınızda başlatıldı.');
            return;
          }
        }
        alert(ext.error || 'İndirme tarayıcıda açılamadı.');
        return;
      }

      const preparedUrl = resolvePreparedModalFrameUrl(data);

      if (preparedUrl) {
        setDownloadFrameUrl(preparedUrl);
        setDownloadStatus('İndirme ekranı modal içinde açıldı.');
        return;
      }

      if (applyDriveFallbackUrl(modalFile)) {
        setDownloadStatus('İndirme fallback ile modal içinde başlatıldı.');
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
    void startPreparedDownload();
  }, [startPreparedDownload]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-4 text-gray-400">Loading files...</p>
      </div>
    );
  }

  const searchTrim = searchTerm.trim();
  const folderHits = searchTrim ? araFolders : [];
  const matchedFolders = searchTrim ? [] : getMatchedFolders(files, searchTerm);

  if (!loading && listFetchError) {
    return (
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            <span>Geri Dön</span>
          </button>
        )}
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-6 text-left text-sm text-red-800 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-200">
          <p className="font-semibold mb-2">Dosya listesi alınamadı</p>
          <p className="whitespace-pre-wrap break-words">{listFetchError}</p>
          <p className="mt-3 text-xs opacity-90">
            API çalışıyor mu ve <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">DATABASE_URL</code> doğru mu
            kontrol edin. Tarayıcıda eski <code className="rounded bg-red-100 px-1 dark:bg-red-900/40">hardwareId</code>{' '}
            kaydı sorun çıkardıysa Geliştirici Araçları → Uygulama → Yerel depolamadan silebilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  if (!loading && files.length === 0 && folderHits.length === 0 && matchedFolders.length === 0) {
    return (
      <div>
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            <span>Geri Dön</span>
          </button>
        )}

        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-6xl mb-4">📁</div>
          <p className="text-gray-600 dark:text-gray-400">
            {searchTrim ? 'Aramaya uygun klasor veya dosya bulunamadi' : 'Bu kategoride henuz dosya yok'}
          </p>
        </div>
      </div>
    );
  }

  const showListPagination = listTotalPages > 1;

  return (
    <div data-file-list>
      <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            <span>Geri Dön</span>
          </button>
        )}
        {showListPagination ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline" aria-hidden>
              |
            </span>
            <button
              type="button"
              disabled={listPage <= 1 || loading}
              onClick={() => setListPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 font-medium text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Önceki
            </button>
            <span className="tabular-nums text-gray-700 dark:text-gray-300 font-medium px-1">
              Sayfa {listPage}/{listTotalPages}
            </span>
            <button
              type="button"
              disabled={listPage >= listTotalPages || loading}
              onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 font-medium text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Sonraki
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h3 className="ilsa-title ilsa-file-list-heading font-semibold">
          {folderHits.length > 0 && files.length === 0
            ? 'Klasor bulundu'
            : `${listTotalFiles || files.length} Dosya Bulundu`}
        </h3>
      </div>

      {folderHits.length > 0 && (
        <div className="mb-6 ilsa-surface p-4">
          <h4 className="ilsa-title font-semibold mb-3">Arama ile bulunan klasörler</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folderHits.map((folder: any) => (
              <button
                type="button"
                key={`ara-folder-${folder.id}`}
                onClick={() => {
                  if (folder.brandId && onNavigateFromSearch) {
                    onNavigateFromSearch({
                      brandId: String(folder.brandId),
                      categoryId: folder.categoryId != null ? String(folder.categoryId) : null,
                      subcategoryId: folder.subcategoryId != null ? String(folder.subcategoryId) : null,
                      path: Array.isArray(folder.path)
                        ? folder.path
                            .map((p: any) => ({
                              id: String(p?.id ?? ''),
                              name: String(p?.name ?? '').trim(),
                            }))
                            .filter((p: { id: string; name: string }) => p.id)
                        : undefined,
                    });
                  } else {
                    onSearchChange?.(folder.name);
                  }
                }}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 shrink-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                    <GridIconMedia
                      src={resolveDirectoryIconForGrid(
                        folder.name,
                        folder.icon || undefined,
                        markaPaths,
                        folder.name,
                      )}
                      fallback="📁"
                    />
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 truncate font-medium">{folder.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!searchTrim && matchedFolders.length > 0 && (
        <div className="mb-6 ilsa-surface p-4">
          <h4 className="ilsa-title font-semibold mb-3">Arama ile bulunan klasörler</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {matchedFolders.map((folder) => (
              <button
                type="button"
                key={`${folder.type}-${folder.name}`}
                onClick={() => onSearchChange?.(folder.name)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                    <GridIconMedia
                      src={resolveDirectoryIconForGrid(folder.name, folder.icon || undefined, markaPaths, folder.name)}
                      fallback="📁"
                    />
                  </div>
                  <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{folder.type}</span>
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{folder.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {files.map((file) => (
          <div
            key={file.id}
            className="ilsa-surface min-h-[150px] p-4 hover:-translate-y-0.5 hover:border-red-400/80 dark:hover:border-red-500/70 hover:shadow-[0_0_0_2px_rgba(255,74,94,0.22),0_14px_28px_rgba(0,0,0,0.32)] transition-all duration-200"
          >
            <div className="flex min-h-[118px] items-start justify-between gap-4">
              <div className="flex min-h-[118px] items-start gap-4 flex-1 min-w-0">
                <div className="w-28 h-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0 overflow-hidden">
                  <GridIconMedia
                    src={resolveDirectoryIconForGrid(
                      file.brandName || file.categoryName || file.subcategoryName || file.name,
                      file.brandIcon || file.categoryIcon,
                      markaPaths,
                      file.brandName || file.categoryName,
                    )}
                    fallback="📄"
                  />
                </div>
                <div className="flex min-h-[118px] flex-1 min-w-0 flex-col justify-between">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="ilsa-title ilsa-file-card-title truncate font-semibold tracking-tight">{file.name}</h4>
                    {file.isPremium && <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
                  </div>

                  <div className="ilsa-file-card-meta flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                    <span className="font-bold text-black dark:text-white">Tarih: {formatCreatedAt(file.createdAt)}</span>
                    <span className="text-gray-400">|</span>
                    <span className="font-extrabold text-green-600 dark:text-green-500">
                      Bilgi:{' '}
                      {String(file.size ?? '')
                        .trim() || '-'}
                    </span>
                    {isAdmin && accessToken ? (
                      <>
                        <span className="text-gray-400">|</span>
                        <button
                          type="button"
                          title="Kim indirdi — listeyi aç"
                          className="inline-flex items-center gap-1 text-red-800 dark:text-red-400 hover:underline font-semibold"
                          onClick={() => setDownloadersModal({ id: file.id, name: file.name })}
                        >
                          <BarChart2 className="w-3 h-3" />
                          {file.downloadCount ?? 0}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                {isLoggedIn(user, accessToken) ? (
                  <>
                    <FavoriteStarButton
                      active={isFavorite(file.id)}
                      onToggle={async () => {
                        const r = await toggleFavorite(file.id, file.name, {
                          brandName: file.brandName,
                          categoryName: file.categoryName,
                        });
                        if (r.needAuth) {
                          onShowAuth();
                        } else if (!r.ok && r.error) {
                          alert(r.error);
                        }
                      }}
                    />
                    <button
                      type="button"
                      title={mayDownload ? 'Dosyayı indir' : 'Premium üyelik gerekir'}
                      onClick={() => {
                        if (!mayDownload) openPremiumUpsell(onShowPremium);
                        else void handleOpenGoogleDrive(file.id);
                      }}
                      disabled={!(file.driveFileId || file.driveWebViewUrl || file.googleDriveLink)}
                      className={`min-w-[110px] px-4 py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 ${
                        !(file.driveFileId || file.driveWebViewUrl || file.googleDriveLink)
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : mayDownload
                            ? 'download-action-btn'
                            : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                      } disabled:opacity-50`}
                    >
                      {!(file.driveFileId || file.driveWebViewUrl || file.googleDriveLink) ? (
                        <span className="ilsa-file-card-action font-semibold">Link Yok</span>
                      ) : mayDownload ? (
                        <>
                          <Download className="w-4 h-4" />
                          <span className="ilsa-file-card-action font-semibold">İndir</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span className="ilsa-file-card-action font-semibold tracking-wide">İNDİRME</span>
                        </>
                      )}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
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
          setDownloadStatus('');
          setPreparingDownload(false);
        }}
        frameFileName={downloadModalFile?.name ?? null}
        externalBrowserHint={isElectronShell()}
        onStartDownload={handleModalDownloadClick}
        getFrameProps={getDownloadIframeFrameProps}
      />
    </div>
  );
}
