import { useEffect, useMemo, useState } from 'react';
import { FileQuestion, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useTheme } from '../../contexts/ThemeContext';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';

type RequestStatus = 'pending' | 'reviewing' | 'done' | 'rejected';

interface FileRequestRow {
  id: string;
  title: string;
  description: string;
  brandHint?: string | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt?: string;
  userId: string;
  username?: string;
  email?: string | null;
  userName?: string | null;
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Beklemede',
  reviewing: 'İnceleniyor',
  done: 'Tamamlandı',
  rejected: 'Reddedildi',
};

export function AdminFileRequestsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [requests, setRequests] = useState<FileRequestRow[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const surfaceClass = isDark
    ? 'rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur'
    : 'rounded-xl border border-slate-200 bg-white shadow-sm';
  const inputClass = isDark
    ? 'w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white'
    : 'w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900';
  const selectClass = isDark
    ? 'px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm'
    : 'px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm';
  const thClass = isDark
    ? 'px-4 py-3 text-left text-xs text-gray-400 uppercase'
    : 'px-4 py-3 text-left text-xs text-slate-600 uppercase';
  const tdClass = isDark ? 'px-4 py-3 text-sm text-gray-200' : 'px-4 py-3 text-sm text-slate-800';

  const load = async () => {
    beginLoad();
    try {
      const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const res = await adminFetch(`${apiFunctionsBase}/admin/file-requests${q}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'İstekler yüklenemedi');
        return;
      }
      setRequests(data.requests || []);
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      endLoad();
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return requests;
    return requests.filter((r) => {
      const hay = [
        r.title,
        r.description,
        r.brandHint,
        r.username,
        r.userName,
        r.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [requests, search]);

  const updateStatus = async (id: string, status: RequestStatus) => {
    setUpdatingId(id);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/file-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Güncellenemedi');
        return;
      }
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, updatedAt: data.request?.updatedAt } : r)),
      );
      toast.success('Durum güncellendi');
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteRequest = async (id: string, title: string) => {
    if (!confirm(`«${title}» isteğini kalıcı olarak silmek istiyor musunuz?`)) return;
    setDeletingId(id);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/file-requests/${id}/delete`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Silinemedi');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success('İstek silindi');
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setDeletingId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, reviewing: 0, done: 0, rejected: 0 };
    for (const r of requests) {
      if (r.status in c) c[r.status as RequestStatus]++;
    }
    return c;
  }, [requests]);

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className={`text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
          >
            <FileQuestion className="w-7 h-7 text-purple-500" />
            Dosya istekleri
          </h1>
          <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
            Kullanıcıların «Dosya İste» formu ile gönderdiği talepler
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Yenile
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((key) => (
          <div key={key} className={`${surfaceClass} px-4 py-3`}>
            <p className={`text-xs uppercase ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              {STATUS_LABEL[key]}
            </p>
            <p className={`mt-1 text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {counts[key]}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Başlık, kullanıcı, marka…"
            className={inputClass}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | RequestStatus)}
          className={selectClass}
        >
          <option value="all">Tüm durumlar</option>
          {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className={`${surfaceClass} overflow-hidden`}>
        {loading ? (
          <p className={`p-8 text-center ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Yükleniyor…</p>
        ) : filtered.length === 0 ? (
          <p className={`p-8 text-center ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
            Kayıt bulunamadı.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className={isDark ? 'bg-gray-900' : 'bg-slate-50'}>
                <tr>
                  <th className={thClass}>Tarih</th>
                  <th className={thClass}>Kullanıcı</th>
                  <th className={thClass}>Başlık</th>
                  <th className={thClass}>Marka</th>
                  <th className={thClass}>Açıklama</th>
                  <th className={thClass}>Durum</th>
                  <th className={`${thClass} text-right`}>İşlem</th>
                </tr>
              </thead>
              <tbody className={isDark ? 'divide-y divide-gray-700' : 'divide-y divide-slate-200'}>
                {filtered.map((r) => (
                  <tr key={r.id} className={isDark ? 'hover:bg-gray-800/60' : 'hover:bg-slate-50'}>
                    <td className={tdClass}>
                      {new Date(r.createdAt).toLocaleString('tr-TR')}
                    </td>
                    <td className={tdClass}>
                      <div className="font-medium">{r.userName || r.username || '—'}</div>
                      {r.email ? (
                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{r.email}</div>
                      ) : null}
                    </td>
                    <td className={`${tdClass} font-medium max-w-[200px]`}>{r.title}</td>
                    <td className={tdClass}>{r.brandHint || '—'}</td>
                    <td className={`${tdClass} max-w-[280px]`}>
                      <p className="line-clamp-3 whitespace-pre-wrap">{r.description}</p>
                    </td>
                    <td className={tdClass}>
                      <select
                        value={r.status}
                        disabled={updatingId === r.id || deletingId === r.id}
                        onChange={(e) => void updateStatus(r.id, e.target.value as RequestStatus)}
                        className={selectClass}
                      >
                        {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <button
                        type="button"
                        disabled={deletingId === r.id || updatingId === r.id}
                        onClick={() => void deleteRequest(r.id, r.title)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border ${
                          isDark
                            ? 'border-red-800 text-red-300 hover:bg-red-950/40'
                            : 'border-red-200 text-red-700 hover:bg-red-50'
                        } disabled:opacity-50`}
                        title="İsteği sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
