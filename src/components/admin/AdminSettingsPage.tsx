import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw, LogOut } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { useTheme } from '../../contexts/ThemeContext';
import { invalidatePublicSiteSettingsCache } from '../../utils/siteSettingsClient';

type SiteSettings = {
  login_mode: 'electron_only' | 'web_allowed';
  web_max_concurrent_sessions: number;
  web_session_heartbeat_seconds: number;
  notify_new_file_toast: boolean;
};

const DEFAULT_SETTINGS: SiteSettings = {
  login_mode: 'electron_only',
  web_max_concurrent_sessions: 1,
  web_session_heartbeat_seconds: 45,
  notify_new_file_toast: true,
};

function normalizeSettings(raw: Partial<SiteSettings> | null | undefined): SiteSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    login_mode: raw.login_mode === 'web_allowed' ? 'web_allowed' : 'electron_only',
    web_max_concurrent_sessions: Math.min(
      50,
      Math.max(1, Math.floor(Number(raw.web_max_concurrent_sessions) || 1)),
    ),
    web_session_heartbeat_seconds: Math.min(
      300,
      Math.max(15, Math.floor(Number(raw.web_session_heartbeat_seconds) || 45)),
    ),
    notify_new_file_toast: raw.notify_new_file_toast !== false,
  };
}

export function AdminSettingsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [settings, setSettings] = useState<SiteSettings>({ ...DEFAULT_SETTINGS });
  const [savedSnapshot, setSavedSnapshot] = useState<SiteSettings>({ ...DEFAULT_SETTINGS });
  const [electronErrors, setElectronErrors] = useState<any[]>([]);
  const [webSessions, setWebSessions] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [saving, setSaving] = useState(false);

  const pageClass = isDark ? 'p-8 max-w-4xl text-slate-100' : 'p-8 max-w-4xl text-slate-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-600';
  const cardClass = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-lg p-6'
    : 'bg-white border border-slate-200 rounded-lg p-6 shadow-sm';
  const labelClass = isDark ? 'block text-white font-medium mb-2' : 'block text-slate-900 font-medium mb-2';
  const inputClass = isDark
    ? 'w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white'
    : 'w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900';
  const hintClass = isDark ? 'text-sm text-gray-500 mt-1' : 'text-sm text-slate-500 mt-1';
  const statusOkClass = isDark
    ? 'mb-4 rounded-lg border border-emerald-700 bg-emerald-900/40 px-4 py-3 text-emerald-100'
    : 'mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900';
  const loadAll = async () => {
    beginLoad();
    try {
      const [sRes, eRes, wRes, oRes] = await Promise.all([
        adminFetch(`${apiFunctionsBase}/admin/settings`),
        adminFetch(`${apiFunctionsBase}/admin/electron-errors?limit=40`),
        adminFetch(`${apiFunctionsBase}/admin/web-presence`),
        adminFetch(`${apiFunctionsBase}/admin/online-summary`),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        const normalized = normalizeSettings(d.settings);
        setSettings(normalized);
        setSavedSnapshot(normalized);
      } else {
        const d = await sRes.json().catch(() => ({}));
        toast.error(d.error || 'Ayarlar y\u00fcklenemedi');
      }
      if (eRes.ok) {
        const d = await eRes.json();
        setElectronErrors(d.errors || []);
      }
      if (wRes.ok) {
        const d = await wRes.json();
        setWebSessions(d.sessions || []);
      }
      if (oRes.ok) {
        const d = await oRes.json();
        setOnlineUsers(Number(d.online?.onlineUsers ?? 0));
      }
    } catch {
      toast.error('Veriler y\u00fcklenemedi');
    } finally {
      endLoad();
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const dirty =
    settings.login_mode !== savedSnapshot.login_mode ||
    settings.web_max_concurrent_sessions !== savedSnapshot.web_max_concurrent_sessions ||
    settings.web_session_heartbeat_seconds !== savedSnapshot.web_session_heartbeat_seconds ||
    settings.notify_new_file_toast !== savedSnapshot.notify_new_file_toast;

  const kickWebSession = async (presenceId: string, username: string) => {
    if (!confirm(`${username || 'Bu kullanıcı'} için web oturumunu kapatmak istiyor musunuz?`)) return;
    setKickingId(presenceId);
    try {
      const res = await adminFetch(
        `${apiFunctionsBase}/admin/web-presence/${encodeURIComponent(presenceId)}/kick`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Oturum kapatılamadı');
      toast.success('Web oturumu kapatıldı');
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oturum kapatılamadı');
    } finally {
      setKickingId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginMode: settings.login_mode,
          webMaxConcurrentSessions: settings.web_max_concurrent_sessions,
          webSessionHeartbeatSeconds: settings.web_session_heartbeat_seconds,
          notifyNewFileToast: settings.notify_new_file_toast,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.settings) {
        const normalized = normalizeSettings(d.settings);
        setSettings(normalized);
        setSavedSnapshot(normalized);
        invalidatePublicSiteSettingsCache();
        toast.success('Ayarlar kaydedildi ve siteye uyguland\u0131.');
        if (normalized.login_mode === 'web_allowed') {
          toast.message('Web giri\u015fi a\u00e7\u0131k', {
            description: 'Kullan\u0131c\u0131lar taray\u0131c\u0131dan giri\u015f yapabilir (admin her zaman web).',
          });
        } else {
          toast.message('Yaln\u0131zca Electron', {
            description: 'Web kullan\u0131c\u0131 giri\u015fi kapal\u0131; masa\u00fcst\u00fc uygulama gerekir.',
          });
        }
      } else {
        toast.error(d.error || d.detail || `Kay\u0131t ba\u015far\u0131s\u0131z (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Kay\u0131t ba\u015far\u0131s\u0131z \u2014 ba\u011flant\u0131 hatas\u0131');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={pageClass}>
        <p className={mutedClass}>Y\u00fckleniyor...</p>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className={`text-3xl mb-2 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Settings className="w-8 h-8" />
            Ayarlar
          </h1>
          <p className={mutedClass}>{'Giri\u015f modu, web oturum limiti ve bildirimler'}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className={
            isDark
              ? 'flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600'
              : 'flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300'
          }
        >
          <RefreshCw className="w-4 h-4" />
          Yenile
        </button>
      </div>

      <div className={statusOkClass}>
        <span className="font-medium">{'Aktif giri\u015f modu: '}</span>
        {savedSnapshot.login_mode === 'web_allowed'
          ? 'Web giri\u015fine izin veriliyor'
          : 'Yaln\u0131zca Electron (masa\u00fcst\u00fc)'}
        {dirty && (
          <span className={isDark ? 'text-amber-200' : 'text-amber-700'}>
            {' \u2014 kaydedilmemi\u015f de\u011fi\u015fiklik var'}
          </span>
        )}
      </div>

      <div className={`${cardClass} space-y-6 mb-8`}>
        <div>
          <label className={labelClass}>{'Giri\u015f y\u00f6ntemi'}</label>
          <select
            value={settings.login_mode}
            onChange={(e) =>
              setSettings({
                ...settings,
                login_mode: e.target.value as SiteSettings['login_mode'],
              })
            }
            className={inputClass}
          >
            <option value="electron_only">{'Yaln\u0131zca Electron (masa\u00fcst\u00fc)'}</option>
            <option value="web_allowed">{'Web giri\u015fine izin ver'}</option>
          </select>
          <p className={hintClass}>
            {
              'Web se\u00e7ildi\u011finde kullan\u0131c\u0131lar taray\u0131c\u0131dan giri\u015f yapabilir; admin her zaman web ile girebilir.'
            }
          </p>
        </div>

        <div>
          <label className={labelClass}>
            {'Web \u2014 varsay\u0131lan e\u015fzamanl\u0131 sekme (kullan\u0131c\u0131 hakk\u0131 yoksa)'}
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.web_max_concurrent_sessions}
            onChange={(e) =>
              setSettings({
                ...settings,
                web_max_concurrent_sessions: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
              })
            }
            className={inputClass}
          />
          <p className={hintClass}>
            Her kullanıcının kendi «eşzamanlı oturum» hakkı vardır (kullanıcı düzenleme). Bu alan yalnızca özel hak tanımlanmamış kullanıcılar için üst sınır görevi görür; plan limiti (Free 1, Premium 3) önceliklidir.
          </p>
        </div>

        <div>
          <label className={labelClass}>{'Web oturum nab\u0131z s\u00fcresi (saniye)'}</label>
          <input
            type="number"
            min={15}
            max={300}
            value={settings.web_session_heartbeat_seconds}
            onChange={(e) =>
              setSettings({
                ...settings,
                web_session_heartbeat_seconds: Math.min(300, Math.max(15, parseInt(e.target.value, 10) || 45)),
              })
            }
            className={inputClass}
          />
          <p className={hintClass}>
            {
              'Sekme kapat\u0131ld\u0131\u011f\u0131nda sunucu bunu alg\u0131lar; nab\u0131z kesilince oturum sonlan\u0131r.'
            }
          </p>
        </div>

        <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <input
            type="checkbox"
            checked={settings.notify_new_file_toast}
            onChange={(e) =>
              setSettings({ ...settings, notify_new_file_toast: e.target.checked })
            }
            className="w-5 h-5 rounded"
          />
          Yeni dosya eklendi\u011finde t\u00fcm \u00fcyelere toast bildirimi g\u00f6nder
        </label>

        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Kaydediliyor...' : dirty ? 'Kaydet' : 'Kaydedildi'}
        </button>
      </div>

      <div className={`${cardClass} mb-8`}>
        <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {'Aktif web oturumlar\u0131'}
          {onlineUsers !== null && (
            <span className={isDark ? 'ml-2 text-sm font-normal text-emerald-400' : 'ml-2 text-sm font-normal text-emerald-700'}>
              ({onlineUsers} çevrimiçi kullanıcı)
            </span>
          )}
        </h2>
        {webSessions.length === 0 ? (
          <p className={hintClass}>Aktif web oturumu yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full text-sm text-left ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>
              <thead>
                <tr className={isDark ? 'text-gray-500 border-b border-gray-700' : 'text-slate-500 border-b border-slate-200'}>
                  <th className="py-2 pr-4">{'Kullan\u0131c\u0131'}</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Konum</th>
                  <th className="py-2 pr-4">{'Son g\u00f6r\u00fclme'}</th>
                  <th className="py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {webSessions.map((row: any) => (
                  <tr
                    key={row.id}
                    className={isDark ? 'border-b border-gray-700/50' : 'border-b border-slate-100'}
                  >
                    <td className="py-2 pr-4">{row.username || row.name || row.user_id}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{row.ip_address || '\u2014'}</td>
                    <td className="py-2 pr-4 text-xs">{row.location || '\u2014'}</td>
                    <td className="py-2 pr-4">
                      {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString('tr-TR') : '\u2014'}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        disabled={kickingId === row.id}
                        onClick={() =>
                          void kickWebSession(
                            String(row.id),
                            String(row.username || row.name || ''),
                          )
                        }
                        className={
                          isDark
                            ? 'inline-flex items-center gap-1 px-2 py-1 text-xs text-red-300 border border-red-500/40 rounded hover:bg-red-500/20 disabled:opacity-50'
                            : 'inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50'
                        }
                        title="Bu web oturumunu kapat"
                      >
                        <LogOut className="w-3 h-3" />
                        {kickingId === row.id ? '…' : 'Çıkış'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h2 className={`text-xl mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {'Electron istemci hatalar\u0131'}
        </h2>
        {electronErrors.length === 0 ? (
          <p className={hintClass}>{'Kay\u0131tl\u0131 hata yok.'}</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {electronErrors.map((err: any) => (
              <li
                key={err.id}
                className={`text-sm border-b pb-2 ${isDark ? 'border-gray-700' : 'border-slate-200'}`}
              >
                <div className={hintClass}>
                  {new Date(err.created_at).toLocaleString('tr-TR')}
                  {err.username ? ` \u00b7 ${err.username}` : ''}
                  {err.error_code ? ` \u00b7 ${err.error_code}` : ''}
                </div>
                <div className={isDark ? 'text-white mt-1' : 'text-slate-900 mt-1'}>{err.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
