import { useState, useEffect } from 'react';
import { User, Lock, Calendar, Crown, Shield, Save, X, Eye, EyeOff, Download, File, Clock, Smartphone, Trash2, RotateCw } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import {
  applyAccessTokenRotation,
  authenticatedFetch,
  buildOptionalAuthHeaders,
  clearSecureToken,
  getBearerForApi,
  revokeAllSessions,
} from '../utils/secureApi';
import { clearStoredJwtAccessToken } from '../utils/authTokens';
import { startDownloadFromPreparePayload } from '../utils/startPreparedDownload';
import '../styles/modern-pages.css';

interface ProfilePageProps {
  user: any;
  accessToken: string;
  onClose: () => void;
  onSignOut: () => void;
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

export function ProfilePage({ user, accessToken, onClose, onSignOut }: ProfilePageProps) {
  const loginId = String(user?.username ?? user?.email ?? '').trim();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'downloads'>('profile');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [redownloadingRecordId, setRedownloadingRecordId] = useState<string | null>(null);
  const [revokingSessions, setRevokingSessions] = useState(false);

  useEffect(() => {
    if (activeTab === 'downloads') {
      loadDownloads();
    }
  }, [activeTab]);

  const loadDownloads = async () => {
    setDownloadsLoading(true);
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
      setDownloadsLoading(false);
    }
  };

  const dismissDownloadRecord = async (recordId: string) => {
    setDismissingId(recordId);
    setMessage(null);
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
        setMessage({ type: 'error', text: formatDismissApiError(data) });
        return;
      }
      setDownloads((prev) => prev.filter((d) => d.id !== recordId));
    } catch {
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    } finally {
      setDismissingId(null);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (
      !window.confirm(
        'Tüm cihazlardaki oturumlar kapatılacak. Bu bilgisayar dahil tekrar giriş yapmanız gerekir. Devam edilsin mi?',
      )
    ) {
      return;
    }
    setRevokingSessions(true);
    setMessage(null);
    try {
      const result = await revokeAllSessions();
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Oturumlar kapatılamadı' });
        return;
      }
      clearStoredJwtAccessToken();
      clearSecureToken();
      localStorage.removeItem('user');
      setMessage({
        type: 'success',
        text: 'Tüm oturumlar sonlandırıldı. Yeniden giriş yapılıyor…',
      });
      window.setTimeout(() => onSignOut(), 800);
    } finally {
      setRevokingSessions(false);
    }
  };

  const redownloadFile = async (recordId: string, fileId: string) => {
    if (!fileId) return;
    setRedownloadingRecordId(recordId);
    setMessage(null);
    try {
      const response = await authenticatedFetch(
        `${apiFunctionsBase}/request-download?fileId=${encodeURIComponent(fileId)}`,
        { method: 'POST' },
        accessToken,
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || 'İndirme başlatılamadı' });
        return;
      }
      startDownloadFromPreparePayload(data);
    } catch {
      setMessage({ type: 'error', text: 'İndirme sırasında bir hata oluştu' });
    } finally {
      setRedownloadingRecordId(null);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Yeni şifreler eşleşmiyor!' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Şifre en az 8 karakter olmalı!' });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${apiFunctionsBase}/change-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            newPassword,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Şifre başarıyla değiştirildi!' });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Şifre değiştirilemedi!' });
      }
    } catch (error) {
      console.error('Şifre değiştirme hatası:', error);
      setMessage({ type: 'error', text: 'Bir hata oluştu!' });
    } finally {
      setLoading(false);
    }
  };

  const getPlanBadge = () => {
    if (user.role === 'admin') {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full text-sm font-semibold shadow-sm">
          <Shield className="w-5 h-5" />
          <span>Admin</span>
        </div>
      );
    }
    if (user.plan === 'premium') {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full text-sm font-semibold shadow-sm">
          <Crown className="w-5 h-5" />
          <span>Premium</span>
        </div>
      );
    }
    return (
      <div className="inline-flex px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full text-sm font-medium">
        Free
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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

  const formatDownloadDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Az önce';
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    
    return date.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDownloadDateTime = (dateString: string) => {
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
    <div className="ilsa-page">
      <div className="ilsa-page-container max-w-7xl">
        <div className="ilsa-surface mb-6 rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30">
                <User className="h-7 w-7 text-red-700 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700 dark:text-red-400">
                  Hesap Merkezi
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  Profil Ayarları
                </h1>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Hesap bilgilerinizi, güvenlik ayarlarınızı ve indirme geçmişinizi buradan yönetin.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <X className="h-4 w-4" />
              Ana Sayfaya Dön
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="ilsa-surface rounded-3xl p-3">
            <div className="mb-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{user.name}</p>
              <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {loginId ? `@${loginId}` : '—'}
              </p>
              <div className="mt-3">{getPlanBadge()}</div>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  activeTab === 'profile'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profil Bilgileri
                </span>
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  activeTab === 'password'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Şifre Değiştir
                </span>
              </button>
              <button
                onClick={() => setActiveTab('downloads')}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  activeTab === 'downloads'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  İndirme Geçmişi
                </span>
              </button>
            </div>
            <button
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Çıkış Yap
            </button>
          </aside>

          <section className="ilsa-surface rounded-3xl p-6 sm:p-7">
            <div className="max-h-[calc(90vh-220px)] overflow-y-auto">
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{user.name}</h3>
                        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{loginId ? `@${loginId}` : '—'}</p>
                      </div>
                      {getPlanBadge()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800/40">
                      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <User className="h-4 w-4 text-red-700 dark:text-red-400" />
                        Kullanıcı adı
                      </div>
                      <p className="font-medium text-zinc-900 dark:text-white">{loginId ? `@${loginId}` : '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800/40">
                      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <Calendar className="h-4 w-4 text-red-700 dark:text-red-400" />
                        Kayıt Tarihi
                      </div>
                      <p className="font-medium text-zinc-900 dark:text-white">{formatDate(user.createdAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800/40">
                      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <User className="h-4 w-4 text-red-700 dark:text-red-400" />
                        Üyelik Tipi
                      </div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        {user.role === 'admin' ? 'Admin' : user.plan === 'premium' ? 'Premium' : 'Free'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
                      <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">
                        Oturum güvenliği
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Masaüstü oturumu yalnızca kayıtlı bilgisayardan kullanılabilir. Şüpheli bir giriş fark ederseniz tüm oturumları kapatın.
                      </p>
                      <button
                        type="button"
                        disabled={revokingSessions}
                        onClick={() => void handleRevokeAllSessions()}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50"
                      >
                        <Smartphone className="h-4 w-4" />
                        {revokingSessions ? 'Kapatılıyor…' : 'Tüm oturumları kapat'}
                      </button>
                    </div>
                  </div>

                  {user.plan === 'free' && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
                      <h4 className="font-bold text-zinc-900 dark:text-white">Premium'a Geçin</h4>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Sınırsız indirme ve öncelikli destek için premium üyeliğe geçin.
                      </p>
                      <button className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
                        Premium Ol
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'password' && (
                <div className="mx-auto max-w-2xl space-y-6">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30">
                      <Lock className="h-6 w-6 text-red-700 dark:text-red-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">Şifre Değiştir</h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Hesabınızın güvenliği için güçlü bir şifre belirleyin. En az 8 karakter önerilir.
                    </p>
                  </div>

                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">Yeni Şifre</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 pr-12 text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">Yeni Şifre (Tekrar)</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 pr-12 text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    {message && (
                      <div
                        className={`rounded-xl p-4 ${
                          message.type === 'success'
                            ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {message.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                          Değiştiriliyor...
                        </>
                      ) : (
                        <>
                          <Save className="h-5 w-5" />
                          Şifreyi Değiştir
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'downloads' && (
                <div className="mx-auto max-w-3xl">
                  <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <Download className="mb-4 h-12 w-12 text-red-700 dark:text-red-400" />
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">İndirme Geçmişi</h3>
                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                      Son indirdiğiniz dosyaları buradan yönetebilir ve tekrar indirebilirsiniz.
                    </p>
                  </div>

                  {downloadsLoading ? (
                    <div className="py-12 text-center">
                      <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent"></div>
                      <p className="text-zinc-600 dark:text-zinc-400">Yükleniyor...</p>
                    </div>
                  ) : downloads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                      <Download className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                      <h3 className="mb-2 text-xl text-gray-900 dark:text-white">Henüz İndirme Yok</h3>
                      <p className="text-gray-600 dark:text-gray-400">İndirdiğiniz dosyalar burada görünecektir.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {downloads.map((download) => (
                        <div
                          key={download.id}
                          className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800/60"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-2xl dark:border-red-900/40 dark:bg-red-950/30">
                                {getFileTypeIcon(download.fileType)}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="mb-1 truncate text-lg text-gray-900 dark:text-white">{download.fileName}</h3>
                              <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Smartphone className="h-4 w-4" />
                                  <span>{download.categoryName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <File className="h-4 w-4" />
                                  <span>{download.subcategoryName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  <span>{formatDownloadDate(download.downloadedAt)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>{formatDownloadDateTime(download.downloadedAt)}</span>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                  {getFileTypeName(download.fileType)}
                                </span>
                                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                  {formatFileSize(download.size)}
                                </span>
                                <button
                                  type="button"
                                  disabled={!download.fileId || redownloadingRecordId === download.id}
                                  onClick={() => redownloadFile(download.id, download.fileId)}
                                  className="download-action-btn inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/40"
                                >
                                  <RotateCw className={`h-3.5 w-3.5 ${redownloadingRecordId === download.id ? 'animate-spin' : ''}`} />
                                  Tekrar indir
                                </button>
                                <button
                                  type="button"
                                  title="Kayıt sunucuda kalır; yönetici indirme kayıtlarında görebilir."
                                  disabled={dismissingId === download.id}
                                  onClick={() => dismissDownloadRecord(download.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-700 dark:text-red-300 dark:hover:bg-red-950/30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {dismissingId === download.id ? 'Kaldırılıyor…' : 'Sil'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
                            <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">Toplam İndirme</div>
                            <div className="text-2xl text-gray-900 dark:text-white">{downloads.length}</div>
                          </div>
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                            <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">Bu Ay</div>
                            <div className="text-2xl text-gray-900 dark:text-white">
                              {downloads.filter(d => {
                                const downloadDate = new Date(d.downloadedAt);
                                const now = new Date();
                                return downloadDate.getMonth() === now.getMonth() &&
                                  downloadDate.getFullYear() === now.getFullYear();
                              }).length}
                            </div>
                          </div>
                          <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                            <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">Bu Hafta</div>
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}