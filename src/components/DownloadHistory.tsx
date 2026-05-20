import { useState, useEffect } from 'react';
import { Download, X, File, Smartphone, Trash2, Calendar } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { applyAccessTokenRotation, buildOptionalAuthHeaders, getBearerForApi } from '../utils/secureApi';
import '../styles/modern-pages.css';

interface DownloadHistoryProps {
  accessToken: string;
  onClose: () => void;
}

interface DownloadRecord {
  id: string;
  fileId: string;
  fileName: string;
  categoryName: string;
  subcategoryName: string;
  fileType?: string;
  size?: number | string | null;
  downloadedAt: string;
}

function formatDismissApiError(data: Record<string, unknown>): string {
  const parts = [data.error, data.detail, data.hint, data.code].map((x) => (x != null ? String(x) : '')).filter(Boolean);
  return parts.join(' — ') || 'Kayıt listeden kaldırılamadı';
}

export function DownloadHistory({ accessToken, onClose }: DownloadHistoryProps) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiFunctionsBase}/download-history`, {
        headers: buildOptionalAuthHeaders(getBearerForApi(accessToken)),
      });

      applyAccessTokenRotation(response);

      if (response.ok) {
        const data = await response.json();
        setDownloads(data.downloads || []);
      }
    } catch (error) {
      console.error('İndirme geçmişi yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissDownloadRecord = async (recordId: string) => {
    setDismissingId(recordId);
    setBanner(null);
    try {
      const res = await fetch(`${apiFunctionsBase}/download-history/dismiss`, {
        method: 'POST',
        headers: {
          ...buildOptionalAuthHeaders(getBearerForApi(accessToken)),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordId }),
      });
      applyAccessTokenRotation(res);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setBanner({ type: 'error', text: formatDismissApiError(data) });
        return;
      }
      setDownloads((prev) => prev.filter((d) => d.id !== recordId));
    } catch {
      setBanner({ type: 'error', text: 'Bir hata oluştu' });
    } finally {
      setDismissingId(null);
    }
  };

  const formatFileSize = (bytes: number | string | undefined | null) => {
    if (bytes === null || bytes === undefined || bytes === '') return '—';
    const n = typeof bytes === 'string' ? parseFloat(String(bytes).replace(',', '.')) : Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    return `${Math.round((n / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFileTypeIcon = (fileType?: string) => {
    switch (fileType) {
      case 'firmware':
        return '📱';
      case 'tool':
        return '🔧';
      case 'driver':
        return '💿';
      default:
        return '📄';
    }
  };

  const getFileTypeName = (fileType?: string) => {
    switch (fileType) {
      case 'firmware':
        return 'Firmware';
      case 'tool':
        return 'Tool';
      case 'driver':
        return 'Driver';
      default:
        return 'Dosya';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="ilsa-surface rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl ilsa-title flex items-center gap-3">
            <Download className="w-7 h-7 text-red-500" />
            İndirme Geçmişi
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {banner && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                banner.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900'
                  : 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-900'
              }`}
            >
              {banner.text}
            </div>
          )}
          {loading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Yükleniyor...</p>
            </div>
          ) : downloads.length === 0 ? (
            <div className="text-center py-12">
              <Download className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl text-gray-900 dark:text-white mb-2">
                Henüz İndirme Yok
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                İndirdiğiniz dosyalar burada görünecektir
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {downloads.map((download) => (
                <div
                  key={download.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl flex items-center justify-center text-2xl">
                        {getFileTypeIcon(download.fileType)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg text-gray-900 dark:text-white mb-1 truncate">
                        {download.fileName}
                      </h3>
                      
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Smartphone className="w-4 h-4" />
                          <span>{download.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <File className="w-4 h-4" />
                          <span>{download.subcategoryName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDateTime(download.downloadedAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                          {getFileTypeName(download.fileType)}
                        </span>
                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs">
                          {formatFileSize(download.size)}
                        </span>
                        <button
                          type="button"
                          title="Kayıt sunucuda kalır; yönetici indirme kayıtlarında görebilir."
                          disabled={dismissingId === download.id}
                          onClick={() => dismissDownloadRecord(download.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-700 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {dismissingId === download.id ? 'Kaldırılıyor…' : 'Sil'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          {downloads.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Toplam İndirme
                  </div>
                  <div className="text-2xl text-gray-900 dark:text-white">
                    {downloads.length}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Bu Ay
                  </div>
                  <div className="text-2xl text-gray-900 dark:text-white">
                    {downloads.filter(d => {
                      const downloadDate = new Date(d.downloadedAt);
                      const now = new Date();
                      return downloadDate.getMonth() === now.getMonth() && 
                             downloadDate.getFullYear() === now.getFullYear();
                    }).length}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Bu Hafta
                  </div>
                  <div className="text-2xl text-gray-900 dark:text-white">
                    {downloads.filter(d => {
                      const downloadDate = new Date(d.downloadedAt);
                      const now = new Date();
                      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      return downloadDate >= weekAgo;
                    }).length}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
