import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw } from 'lucide-react';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { invalidatePublicSiteSettingsCache } from '../../utils/siteSettingsClient';

type SiteSettings = {
  login_mode: 'electron_only' | 'web_allowed';
  web_max_concurrent_sessions: number;
  web_session_heartbeat_seconds: number;
  notify_new_file_toast: boolean;
};

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [electronErrors, setElectronErrors] = useState<any[]>([]);
  const [webSessions, setWebSessions] = useState<any[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadAll = async () => {
    beginLoad();
    setMessage('');
    try {
      const [sRes, eRes, wRes] = await Promise.all([
        adminFetch(`${apiFunctionsBase}/admin/settings`),
        adminFetch(`${apiFunctionsBase}/admin/electron-errors?limit=40`),
        adminFetch(`${apiFunctionsBase}/admin/web-presence`),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setSettings(d.settings);
      }
      if (eRes.ok) {
        const d = await eRes.json();
        setElectronErrors(d.errors || []);
      }
      if (wRes.ok) {
        const d = await wRes.json();
        setWebSessions(d.sessions || []);
      }
    } catch {
      setMessage('Veriler yüklenemedi.');
    } finally {
      endLoad();
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
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
      if (res.ok) {
        const d = await res.json();
        setSettings(d.settings);
        invalidatePublicSiteSettingsCache();
        setMessage('Ayarlar kaydedildi.');
      } else {
        const d = await res.json().catch(() => ({}));
        setMessage(d.error || 'Kayıt başarısız');
      }
    } catch {
      setMessage('Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="p-8 text-gray-400">Yükleniyor...</div>
    );
  }

  const s = settings || {
    login_mode: 'electron_only' as const,
    web_max_concurrent_sessions: 1,
    web_session_heartbeat_seconds: 45,
    notify_new_file_toast: true,
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-white mb-2 flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Ayarlar
          </h1>
          <p className="text-gray-400">Giriş modu, web oturum limiti ve bildirimler</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600"
        >
          <RefreshCw className="w-4 h-4" />
          Yenile
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-purple-700 bg-purple-900/30 px-4 py-3 text-purple-100">
          {message}
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-6 mb-8">
        <div>
          <label className="block text-white font-medium mb-2">Giriş yöntemi</label>
          <select
            value={s.login_mode}
            onChange={(e) =>
              setSettings({
                ...s,
                login_mode: e.target.value as SiteSettings['login_mode'],
              })
            }
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
          >
            <option value="electron_only">Yalnızca Electron (masaüstü)</option>
            <option value="web_allowed">Web girişine izin ver</option>
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Web seçildiğinde kullanıcılar tarayıcıdan giriş yapabilir; admin her zaman web ile girebilir.
          </p>
        </div>

        <div>
          <label className="block text-white font-medium mb-2">
            Web — eşzamanlı oturum sayısı (çıkış yapmadan sekme)
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={s.web_max_concurrent_sessions}
            onChange={(e) =>
              setSettings({
                ...s,
                web_max_concurrent_sessions: Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)),
              })
            }
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
          />
        </div>

        <div>
          <label className="block text-white font-medium mb-2">Web oturum nabız süresi (saniye)</label>
          <input
            type="number"
            min={15}
            max={300}
            value={s.web_session_heartbeat_seconds}
            onChange={(e) =>
              setSettings({
                ...s,
                web_session_heartbeat_seconds: Math.min(300, Math.max(15, parseInt(e.target.value, 10) || 45)),
              })
            }
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
          />
          <p className="text-sm text-gray-500 mt-1">
            Sekme kapatıldığında sunucu bunu algılar; nabız kesilince oturum sonlanır.
          </p>
        </div>

        <label className="flex items-center gap-3 text-white cursor-pointer">
          <input
            type="checkbox"
            checked={s.notify_new_file_toast}
            onChange={(e) =>
              setSettings({ ...s, notify_new_file_toast: e.target.checked })
            }
            className="w-5 h-5 rounded"
          />
          Yeni dosya eklendiğinde tüm üyelere toast bildirimi gönder
        </label>

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
        <h2 className="text-xl text-white mb-4">Aktif web oturumları</h2>
        {webSessions.length === 0 ? (
          <p className="text-gray-500 text-sm">Aktif web oturumu yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="py-2 pr-4">Kullanıcı</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Son görülme</th>
                </tr>
              </thead>
              <tbody>
                {webSessions.map((row: any) => (
                  <tr key={row.id} className="border-b border-gray-700/50">
                    <td className="py-2 pr-4">{row.username || row.name || row.user_id}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{row.ip_address || '—'}</td>
                    <td className="py-2 pr-4">{row.last_seen_at ? new Date(row.last_seen_at).toLocaleString('tr-TR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl text-white mb-4">Electron istemci hataları</h2>
        {electronErrors.length === 0 ? (
          <p className="text-gray-500 text-sm">Kayıtlı hata yok.</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {electronErrors.map((err: any) => (
              <li key={err.id} className="text-sm border-b border-gray-700 pb-2">
                <div className="text-gray-400 text-xs">
                  {new Date(err.created_at).toLocaleString('tr-TR')}
                  {err.username ? ` · ${err.username}` : ''}
                  {err.error_code ? ` · ${err.error_code}` : ''}
                </div>
                <div className="text-white mt-1">{err.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
