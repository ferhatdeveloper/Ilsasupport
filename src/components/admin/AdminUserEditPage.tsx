import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  KeyRound,
  HardDrive,
  CheckCircle2,
  PauseCircle,
  Trash2,
  RefreshCw,
  Monitor,
  Globe,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useTheme } from '../../contexts/ThemeContext';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { formatPlanLabel } from '../../utils/turkishLabels';

export interface AdminUserDetail {
  id: string;
  username: string;
  email?: string | null;
  name: string;
  role?: string;
  plan: 'free' | 'premium' | 'admin';
  createdAt?: string;
  expiresAt?: string | null;
  downloadCount?: number;
  activeSessions?: number;
  maxSessions?: number;
  hardwareId?: string | null;
  registeredDeviceId?: string | null;
  loginApproved?: boolean;
}

export interface AdminUserDevice {
  id: string;
  kind: 'session' | 'primary';
  deviceId: string;
  hardwareId: string | null;
  label: string;
  userAgent: string | null;
  ipAddress: string | null;
  isActive: boolean;
  isPrimary: boolean;
  status: 'approved' | 'inactive' | 'pending';
  lastActivity: string | null;
  createdAt: string | null;
  source: 'sql' | 'kv';
}

interface AdminUserEditPageProps {
  userId: string;
  onBack: () => void;
  onSaved: () => void;
}

export function AdminUserEditPage({ userId, onBack, onSaved }: AdminUserEditPageProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const jsonHeaders = { 'Content-Type': 'application/json' };

  const pageClass = isDark ? 'flex flex-col h-full min-h-0 bg-gray-900' : 'flex flex-col h-full min-h-0 bg-slate-50';
  const headerClass = isDark
    ? 'shrink-0 border-b border-gray-700 bg-gray-800/80 px-6 py-4'
    : 'shrink-0 border-b border-slate-200 bg-white px-6 py-4';
  const panelClass = isDark
    ? 'rounded-xl border border-gray-700 bg-gray-800/60 p-6'
    : 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm';
  const labelClass = isDark ? 'block text-sm text-gray-400 mb-1' : 'block text-sm text-slate-600 mb-1';
  const fieldClass = isDark
    ? 'w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600'
    : 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600';
  const disabledFieldClass = isDark
    ? 'w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-500'
    : 'w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500';
  const titleClass = isDark ? 'text-2xl font-semibold text-white' : 'text-2xl font-semibold text-slate-900';
  const subtitleClass = isDark ? 'text-sm text-gray-400 mt-1' : 'text-sm text-slate-600 mt-1';

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [devices, setDevices] = useState<AdminUserDevice[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);
  const [forceLogoutBusy, setForceLogoutBusy] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    plan: 'free' as AdminUserDetail['plan'],
    durationDays: 30,
    maxSessions: 1,
    password: '',
    passwordConfirm: '',
  });

  const loadUser = useCallback(async () => {
    const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Kullanıcı yüklenemedi');
    }
    const data = await res.json();
    const u = data.user as AdminUserDetail;
    setUser(u);
    const duration = u.expiresAt
      ? Math.max(1, Math.ceil((new Date(u.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 30;
    setFormData({
      name: u.name,
      plan: u.plan,
      durationDays: duration,
      maxSessions: u.maxSessions ?? (u.plan === 'admin' ? 10 : u.plan === 'premium' ? 3 : 1),
      password: '',
      passwordConfirm: '',
    });
  }, [userId]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/devices`);
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Cihazlar yüklenemedi (${res.status})`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDevicesLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      beginLoad();
      try {
        await loadUser();
        await loadDevices();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Yükleme hatası');
      } finally {
        endLoad();
      }
    })();
  }, [loadUser, loadDevices, beginLoad, endLoad]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password || formData.passwordConfirm) {
      if (formData.password.length < 6) {
        toast.error('Şifre en az 6 karakter olmalı');
        return;
      }
      if (formData.password !== formData.passwordConfirm) {
        toast.error('Şifreler eşleşmiyor');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        plan: formData.plan,
        maxSessions: Math.min(50, Math.max(1, formData.maxSessions)),
      };
      if (formData.password) payload.password = formData.password;
      if (formData.plan !== 'admin') {
        const days = Number(formData.durationDays);
        if (!Number.isFinite(days) || days < 1) {
          toast.error('Üyelik süresi en az 1 gün olmalı');
          setSaving(false);
          return;
        }
        payload.durationDays = days;
      }

      const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Güncelleme başarısız');
      }
      const saved = await res.json().catch(() => ({}));
      const savedUser = saved.user as AdminUserDetail | undefined;
      toast.success(formData.password ? 'Kullanıcı ve şifre güncellendi' : 'Kullanıcı güncellendi');
      await loadUser();
      if (savedUser?.expiresAt && formData.plan !== 'admin') {
        const days = Math.max(
          1,
          Math.ceil((new Date(savedUser.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
        setFormData((prev) => ({ ...prev, durationDays: days, password: '', passwordConfirm: '' }));
      } else {
        setFormData((prev) => ({ ...prev, password: '', passwordConfirm: '' }));
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const deviceAction = async (
    actionKey: string,
    action: 'approve' | 'deactivate' | 'delete',
    hardwareId?: string | null,
  ) => {
    const labels = { approve: 'onaylamak', deactivate: 'pasife almak', delete: 'silmek' };
    if (!confirm(`Bu cihazı ${labels[action]} istediğinize emin misiniz?`)) return;

    setDeviceActionId(actionKey);
    try {
      let res: Response;
      if (action === 'delete') {
        res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/devices/remove`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            deviceId: actionKey,
            hardwareId: hardwareId ?? undefined,
          }),
        });
        if (res.status === 404) {
          res = await adminFetch(
            `${apiFunctionsBase}/admin/users/${userId}/devices/${encodeURIComponent(actionKey)}`,
            {
              method: 'DELETE',
              headers: jsonHeaders,
              body: JSON.stringify({ hardwareId: hardwareId ?? undefined }),
            },
          );
        }
      } else if (action === 'deactivate') {
        res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/devices/deactivate`, {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ deviceId: actionKey, hardwareId: hardwareId ?? undefined }),
        });
      } else {
        const body =
          action === 'approve' && hardwareId
            ? JSON.stringify({ hardwareId })
            : '{}';
        res = await adminFetch(
          `${apiFunctionsBase}/admin/users/${userId}/devices/${encodeURIComponent(actionKey)}/${action}`,
          { method: 'POST', headers: jsonHeaders, body },
        );
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'İşlem başarısız');
      }
      const data = await res.json();
      const nextDevices = Array.isArray(data.devices) ? data.devices : [];
      setDevices(nextDevices);
      if (action === 'delete' && nextDevices.some((d) => d.id === actionKey || d.deviceId === actionKey)) {
        throw new Error(data.error || 'Cihaz silinemedi — listede hâlâ görünüyor');
      }
      toast.success(
        action === 'approve'
          ? 'Cihaz onaylandı'
          : action === 'deactivate'
            ? 'Cihaz pasife alındı'
            : 'Cihaz silindi',
      );
      if (action === 'delete') {
        await loadDevices();
      } else {
        await loadUser();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setDeviceActionId(null);
    }
  };

  const setLoginApproval = async (approved: boolean) => {
    const path = approved ? 'approve-login' : 'revoke-login';
    if (!confirm(approved ? 'Bu kullanıcıya giriş onayı verilsin mi?' : 'Giriş onayı kaldırılsın mı?')) return;
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/${path}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız');
      toast.success(approved ? 'Hesap girişi onaylandı' : 'Giriş onayı kaldırıldı');
      await loadUser();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    }
  };

  const forceLogout = async () => {
    if (
      !confirm(
        `${user?.name || user?.username} kullanıcısının tüm oturumlarını (web, masaüstü, JWT) sonlandırmak istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    setForceLogoutBusy(true);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/force-logout`, {
        method: 'POST',
        headers: jsonHeaders,
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Çıkış yapılamadı');
      toast.success('Tüm oturumlar sonlandırıldı');
      await Promise.all([loadUser(), loadDevices()]);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Çıkış yapılamadı');
    } finally {
      setForceLogoutBusy(false);
    }
  };

  const resetAllHardware = async () => {
    if (!confirm('Tüm cihaz kilidini sıfırlamak istediğinize emin misiniz?')) return;
    setDeviceActionId('__reset__');
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/reset-hardware`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Sıfırlama başarısız');
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.devices)) setDevices(data.devices);
      toast.success('Cihaz kilidi sıfırlandı');
      await loadUser();
      if (!Array.isArray(data.devices)) await loadDevices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sıfırlama başarısız');
    } finally {
      setDeviceActionId(null);
    }
  };

  const statusBadge = (status: AdminUserDevice['status']) => {
    const map = {
      approved: isDark
        ? 'bg-green-500/20 text-green-300 border-green-500/40'
        : 'bg-green-50 text-green-800 border-green-200',
      pending: isDark
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
        : 'bg-amber-50 text-amber-800 border-amber-200',
      inactive: isDark
        ? 'bg-gray-600/40 text-gray-400 border-gray-600'
        : 'bg-slate-100 text-slate-500 border-slate-200',
    };
    const label = { approved: 'Onaylı', pending: 'Beklemede', inactive: 'Pasif' };
    return (
      <span className={`px-2 py-0.5 text-xs rounded border ${map[status]}`}>{label[status]}</span>
    );
  };

  const backBtnClass = isDark
    ? 'flex items-center gap-2 text-gray-300 hover:text-white'
    : 'flex items-center gap-2 text-slate-600 hover:text-slate-900';

  if (loading || !user) {
    return (
      <div className={pageClass}>
        <header className={headerClass}>
          <button type="button" onClick={onBack} className={backBtnClass}>
            <ArrowLeft className="w-5 h-5" />
            Kullanıcı listesi
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <p className={isDark ? 'text-gray-400' : 'text-slate-500'}>Yükleniyor…</p>
        </div>
        </div>
    );
  }

  return (
    <div className={pageClass}>
      <header className={headerClass}>
        <button type="button" onClick={onBack} className={`${backBtnClass} mb-3`}>
          <ArrowLeft className="w-5 h-5" />
          Kullanıcı listesi
        </button>
        <h1 className={titleClass}>{user.name}</h1>
        <p className={subtitleClass}>
          @{user.username}
          {user.email ? ` · ${user.email}` : ''}
          {' · '}
          <span className="font-medium">{formatPlanLabel(user.plan)}</span>
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <section
          className={
            isDark
              ? 'rounded-xl border border-red-500/40 bg-red-500/10 p-4'
              : 'rounded-xl border border-red-300 bg-red-50 p-4'
          }
        >
          <h2 className={isDark ? 'text-lg font-medium text-red-200 mb-2' : 'text-lg font-medium text-red-900 mb-2'}>
            Oturum yönetimi
          </h2>
          <p className={isDark ? 'text-sm text-red-100/80 mb-3' : 'text-sm text-red-800 mb-3'}>
            Kullanıcıyı sistemden çıkarır: web sekmeleri, masaüstü uygulaması ve JWT oturumları sonlanır.
            {typeof user.activeSessions === 'number' && user.activeSessions > 0 && (
              <span className="block mt-1">
                Kayıtlı aktif oturum: <strong>{user.activeSessions}</strong>
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => void forceLogout()}
            disabled={forceLogoutBusy}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {forceLogoutBusy ? 'Sonlandırılıyor…' : 'Tüm oturumları kapat'}
          </button>
        </section>

        {user.role !== 'admin' && user.plan !== 'admin' && (
          <section
            className={
              isDark
                ? 'rounded-xl border border-amber-500/40 bg-amber-500/10 p-4'
                : 'rounded-xl border border-amber-300 bg-amber-50 p-4'
            }
          >
            <h2 className={isDark ? 'text-lg font-medium text-amber-200 mb-2' : 'text-lg font-medium text-amber-900 mb-2'}>
              Giriş onayı (hesap)
            </h2>
            <p className={isDark ? 'text-sm text-amber-100/80 mb-3' : 'text-sm text-amber-800 mb-3'}>
              {user.loginApproved
                ? 'Bu kullanıcı onaylı cihazla giriş yapabilir.'
                : 'Hesap onaylanmadan giriş yapılamaz. Cihaz onayı ayrıca gereklidir.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {!user.loginApproved ? (
                <button
                  type="button"
                  onClick={() => void setLoginApproval(true)}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Hesabı onayla
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setLoginApproval(false)}
                  className={
                    isDark
                      ? 'px-4 py-2 text-sm border border-gray-600 text-gray-200 rounded-lg hover:bg-gray-700'
                      : 'px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100'
                  }
                >
                  Giriş onayını kaldır
                </button>
              )}
            </div>
          </section>
        )}

        <form onSubmit={handleSave} className={panelClass}>
          <h2 className={isDark ? 'text-lg font-medium text-white mb-4' : 'text-lg font-medium text-slate-900 mb-4'}>
            Hesap bilgileri
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1">
              <label className={labelClass}>Kullanıcı adı</label>
              <input type="text" disabled value={user.username} className={disabledFieldClass} />
            </div>
            <div className="md:col-span-1">
              <label className={labelClass}>İsim</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div className="md:col-span-1">
              <label className={labelClass}>Üye tipi</label>
              <select
                value={formData.plan}
                onChange={(e) => {
                  const plan = e.target.value as AdminUserDetail['plan'];
                  const defaultMax = plan === 'admin' ? 10 : plan === 'premium' ? 3 : 1;
                  setFormData({ ...formData, plan, maxSessions: defaultMax });
                }}
                className={fieldClass}
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {formData.plan !== 'admin' && (
              <div className="md:col-span-1">
                <label className={labelClass}>Üyelik süresi (gün — bugünden itibaren)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.durationDays}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n > 0) {
                      setFormData({ ...formData, durationDays: n });
                    }
                  }}
                  className={fieldClass}
                />
              </div>
            )}
            <div className="md:col-span-1">
              <label className={labelClass}>Eşzamanlı oturum (cihaz) hakkı</label>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={formData.maxSessions}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxSessions: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  })
                }
                className={fieldClass}
              />
              <p className={isDark ? 'text-xs text-gray-500 mt-1' : 'text-xs text-slate-500 mt-1'}>
                Aktif: {user.activeSessions ?? 0} / {formData.maxSessions} — Free varsayılan 1, Premium 3, Admin 10
              </p>
            </div>
          </div>

          <div
            className={
              isDark
                ? 'mt-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3'
                : 'mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3'
            }
          >
            <div className="flex items-center gap-2">
              <KeyRound className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              <span className={isDark ? 'text-sm font-medium text-white' : 'text-sm font-medium text-slate-900'}>
                Şifre değiştir
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-1">
                <label className={labelClass}>Yeni şifre</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Boş = değişmez"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div className="md:col-span-1">
                <label className={labelClass}>Tekrar</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className={
                isDark
                  ? 'px-6 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600'
                  : 'px-6 py-2.5 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300'
              }
            >
              İptal
            </button>
          </div>
        </form>

        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <HardDrive className={isDark ? 'text-purple-400 w-5 h-5' : 'text-purple-600 w-5 h-5'} />
              <h2 className={isDark ? 'text-lg font-medium text-white' : 'text-lg font-medium text-slate-900'}>
                Kayıtlı cihazlar
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadDevices()}
                disabled={devicesLoading}
                className={
                  isDark
                    ? 'flex items-center gap-1 px-3 py-1.5 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700'
                    : 'flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50'
                }
              >
                <RefreshCw className={`w-4 h-4 ${devicesLoading ? 'animate-spin' : ''}`} />
                Yenile
              </button>
              <button
                type="button"
                onClick={() => void resetAllHardware()}
                disabled={deviceActionId === '__reset__'}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-500/10"
              >
                Tüm kilidi sıfırla
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <p className={isDark ? 'text-gray-400 text-sm py-6 text-center' : 'text-slate-500 text-sm py-6 text-center'}>
              Kayıtlı cihaz veya aktif oturum yok.
            </p>
          ) : (
            <div className="space-y-3">
              {devices.map((d) => {
                const busy = deviceActionId === d.id;
                const isWeb = d.deviceId.startsWith('web_');
                return (
                  <div
                    key={d.id}
                    className={
                      isDark
                        ? 'rounded-lg border border-gray-700 bg-gray-900/40 p-4'
                        : 'rounded-lg border border-slate-200 bg-slate-50 p-4'
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {isWeb ? (
                          <Globe className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                        ) : (
                          <Monitor className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={isDark ? 'font-medium text-white' : 'font-medium text-slate-900'}>
                              {d.label}
                            </span>
                            {statusBadge(d.status)}
                            {d.isPrimary && (
                              <span
                                className={
                                  isDark
                                    ? 'text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded'
                                    : 'text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded'
                                }
                              >
                                Birincil
                              </span>
                            )}
                          </div>
                          {d.hardwareId && (
                            <p className={`text-xs mt-1 font-mono break-all ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                              {d.hardwareId}
                            </p>
                          )}
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                            Oturum: {d.deviceId}
                            {d.lastActivity &&
                              ` · Son: ${new Date(d.lastActivity).toLocaleString('tr-TR')}`}
                            {d.ipAddress && ` · IP: ${d.ipAddress}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {d.status !== 'approved' && d.hardwareId && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deviceAction(d.id, 'approve', d.hardwareId)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Onayla
                          </button>
                        )}
                        {(d.isActive || d.status === 'approved') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deviceAction(d.id, 'deactivate')}
                            className={
                              isDark
                                ? 'flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50'
                                : 'flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50'
                            }
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            Pasife al
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deviceAction(d.id, 'delete', d.hardwareId)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/90 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Sil
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
