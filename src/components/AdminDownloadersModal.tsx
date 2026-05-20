import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { buildOptionalAuthHeaders } from '../utils/secureApi';

export type DownloaderEntry = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  downloadedAt: string;
};

export function AdminDownloadersModal({
  open,
  fileId,
  fileName,
  accessToken,
  onClose,
}: {
  open: boolean;
  fileId: string;
  fileName: string;
  accessToken: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<DownloaderEntry[]>([]);

  useEffect(() => {
    if (!open || !accessToken || !fileId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${apiFunctionsBase}/admin/file/${encodeURIComponent(fileId)}/downloaders`,
          { headers: buildOptionalAuthHeaders(accessToken) },
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Liste yüklenemedi');
        }
        if (!cancelled) setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Hata';
        if (!cancelled) setError(msg);
        setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fileId, accessToken]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full max-h-[min(80vh,520px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="admin-downloaders-title"
      >
        <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h3 id="admin-downloaders-title" className="font-semibold text-gray-900 dark:text-white text-sm">
              İndiren kullanıcılar
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-[120px]">
          {loading && <p className="text-sm text-gray-500">Yükleniyor…</p>}
          {error && !loading && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p className="text-sm text-gray-500">
              Kayıtlı kullanıcı indirmesi yok (giriş yapılmadan veya ilk kez ise görünmez).
            </p>
          )}
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id || `${entry.userId}-${entry.downloadedAt}`}
                className="text-sm border border-gray-100 dark:border-gray-800 rounded-lg p-2"
              >
                <div className="font-medium text-gray-900 dark:text-gray-100">{entry.userName}</div>
                <div className="text-xs text-gray-500 truncate">
                  {entry.userEmail.includes('@') ? entry.userEmail : `@${entry.userEmail}`}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(entry.downloadedAt).toLocaleString('tr-TR')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
