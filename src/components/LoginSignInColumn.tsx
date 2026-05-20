import { useEffect, useState } from 'react';
import { Lock, User, Monitor } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { readResponseJson } from '../utils/readResponseJson';
import { DesktopAppDownload } from './DesktopAppDownload';
import { fetchPublicSiteSettings } from '../utils/siteSettingsClient';
import { setStoredWebPresenceKey } from '../hooks/useWebPresence';

const ENV_ALLOW_WEB =
  import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN === 'false' ||
  import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN === '0';

interface LoginSignInColumnProps {
  allowWebSignIn?: boolean;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  sessionError: { show: boolean; username: string; password: string };
  setSessionError: (v: { show: boolean; username: string; password: string }) => void;
  onSignIn: (token: string, user: unknown) => void;
}

export function LoginSignInColumn({
  allowWebSignIn = false,
  username,
  setUsername,
  password,
  setPassword,
  loading,
  setLoading,
  error,
  setError,
  sessionError,
  setSessionError,
  onSignIn,
}: LoginSignInColumnProps) {
  const [loginMode, setLoginMode] = useState<'electron_only' | 'web_allowed'>('electron_only');
  useEffect(() => {
    void fetchPublicSiteSettings().then((s) => setLoginMode(s.loginMode));
  }, []);
  const showWebSignIn = allowWebSignIn || loginMode === 'web_allowed' || ENV_ALLOW_WEB;

  return (
    <div className="ilsa-surface rounded-2xl p-8 shadow-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Lock className="w-8 h-8 text-purple-400" />
        <h2 className="text-2xl ilsa-title">Giriş Yap</h2>
      </div>

      {!showWebSignIn ? (
        <div className="space-y-4">
          <div className="flex justify-center">
            <Monitor className="w-14 h-14 text-purple-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm text-center leading-relaxed">
            Giriş yalnızca <strong>ILSA Support masaüstü</strong> uygulaması ile yapılır. Hesap bu bilgisayara
            kaydedilir.
          </p>
          <DesktopAppDownload />
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Portable sürüm (~73 MB) — Windows 64-bit
          </p>
        </div>
      ) : (
        <>
          {allowWebSignIn && (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-4 text-center">
              Yönetici web girişi
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setSessionError({ show: false, username: '', password: '' });
              setLoading(true);
              try {
                const response = await fetch(`${apiFunctionsBase}/signin`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username, password, forceLogin: false }),
                });
                const data = await readResponseJson<{
                  error?: string;
                  errorCode?: string;
                  accessToken?: string;
                  user?: unknown;
                  webPresenceKey?: string;
                }>(response);
                if (!response.ok) {
                  if (data.error?.includes('maksimum') || data.error?.includes('limit')) {
                    setSessionError({ show: true, username, password });
                    return;
                  }
                  if (
                    data.errorCode === 'LOGIN_PENDING_APPROVAL' ||
                    data.errorCode === 'DEVICE_PENDING_APPROVAL'
                  ) {
                    throw new Error(data.error || 'Giriş için yönetici onayı gerekli');
                  }
                  throw new Error(data.error || 'Giriş başarısız');
                }
                if (!data.accessToken || !data.user) {
                  throw new Error('Sunucudan geçersiz yanıt');
                }
                if (data.webPresenceKey) setStoredWebPresenceKey(data.webPresenceKey);
                onSignIn(data.accessToken, data.user);
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Giriş başarısız');
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">Kullanıcı adı</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                  placeholder="ornek_kullanici"
                  minLength={3}
                  maxLength={32}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-500/20 border border-red-300 rounded-lg text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
