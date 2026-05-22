import { useState, useEffect } from 'react';
import { fetchPublicSiteSettings } from '../utils/siteSettingsClient';
import { getWebRememberPrefill, webSignIn } from '../utils/webRememberMe';
import { WebRememberMeCheckbox } from './WebRememberMeCheckbox';
import { X, Lock, User, LogIn, UserPlus, Monitor } from 'lucide-react';

const ENV_ALLOW_WEB =
  import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN === 'false' ||
  import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN === '0';
import { apiFunctionsBase } from '../utils/supabase/info';
import { readResponseJson } from '../utils/readResponseJson';
import { SITE_LOGO_SRC } from '../constants/siteAssets';
import { DesktopAppDownload } from './DesktopAppDownload';
import '../styles/modern-pages.css';

interface AuthModalProps {
  view: 'signin' | 'signup';
  onClose: () => void;
  onSignIn: (token: string, user: any) => void;
  onSwitchView: () => void;
}

export function AuthModal({ view, onClose, onSignIn, onSwitchView }: AuthModalProps) {
  const [loginMode, setLoginMode] = useState<'electron_only' | 'web_allowed'>('electron_only');
  useEffect(() => {
    void fetchPublicSiteSettings().then((s) => setLoginMode(s.loginMode));
  }, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionLimited, setSessionLimited] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    const pre = getWebRememberPrefill();
    if (pre.username && !username) setUsername(pre.username);
    setRememberMe(pre.enabled);
  }, []);

  const finishSuccess = (token: string, user: unknown) => {
    onSignIn(token, user as any);
    setLoading(false);
    setSessionLimited(false);
    onClose();
  };

  const signInWithPassword = async (un: string, pw: string, forceLogin: boolean) => {
    const signinRes = await fetch(`${apiFunctionsBase}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: un, password: pw, forceLogin }),
    });
    const signinData = await readResponseJson<{
      error?: string;
      errorCode?: string;
      accessToken?: string;
      user?: unknown;
      webPresenceKey?: string;
      sessionId?: string;
    }>(signinRes);

    if (!signinRes.ok) {
      if (signinData.errorCode === 'DEVICE_MISMATCH') {
        throw new Error(
          'Bu hesap başka bir cihaza kayıtlı. Kayıtlı cihazınızdan veya aynı tarayıcıdan deneyin.',
        );
      }
      if (signinData.errorCode === 'SESSION_LIMIT_EXCEEDED') {
        setSessionLimited(true);
        throw new Error(
          signinData.error ||
            'Bu hesap için açık oturum sınırına ulaşıldı. Aşağıdan diğer oturumu kapatıp giriş yapabilirsiniz.',
        );
      }
      throw new Error(signinData.error || 'Giriş başarısız');
    }
    if (!signinData.accessToken || !signinData.user) {
      throw new Error('Sunucudan geçersiz yanıt');
    }
    const presenceKey = signinData.webPresenceKey || signinData.sessionId;
    if (presenceKey) setStoredWebPresenceKey(presenceKey);
    return signinData;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSessionLimited(false);
    setLoading(true);

    try {
      if (view === 'signup') {
        const signupRes = await fetch(`${apiFunctionsBase}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, name }),
        });
        const signupData = await readResponseJson<{ error?: string }>(signupRes);
        if (!signupRes.ok) {
          throw new Error(signupData.error || 'Kayıt başarısız');
        }
        const signed = await signInWithPassword(username, password, true);
        finishSuccess(signed.accessToken!, signed.user!);
        return;
      }

      const signed = await signInWithPassword(username, password, false);
      finishSuccess(signed.accessToken!, signed.user!);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bir hata oluştu';
      setError(message);
      setLoading(false);
    }
  };

  const handleForceSessionLogin = async () => {
    setError('');
    setSessionLimited(false);
    setLoading(true);
    try {
      const signed = await signInWithPassword(username, password, true);
      finishSuccess(signed.accessToken!, signed.user!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/55 dark:bg-black/75 flex items-center justify-center p-4 z-50">
      <div className="ilsa-surface max-w-md w-full p-8 relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          aria-label="Kapat"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex justify-center mb-4">
          <img
            src={SITE_LOGO_SRC}
            alt="ILSA Support"
            className="h-16 sm:h-[4.75rem] w-auto max-w-[280px] object-contain drop-shadow-md mx-auto"
            width={280}
            height={76}
            decoding="async"
          />
        </div>

        <h2 className="ilsa-title mb-2 text-center">
          {view === 'signin' ? 'Giriş yap' : 'Hesap oluştur'}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          {view === 'signin'
            ? 'Kullanıcı adı ve şifrenizle giriş yapın.'
            : 'Kayıt olduktan sonra otomatik giriş yapılır.'}
        </p>

        {loginMode === 'electron_only' && !ENV_ALLOW_WEB ? (
          <div className="space-y-4 text-center py-2">
            <Monitor className="w-12 h-12 text-purple-500 mx-auto" />
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {view === 'signup' ? (
                <>
                  Kayıt ve giriş için <strong>ILSA Support masaüstü</strong> uygulamasını kullanın. Kayıt sekmesinden
                  hesap oluşturun; yönetici onayından sonra giriş yapabilirsiniz.
                </>
              ) : (
                <>
                  Giriş için <strong>ILSA Support masaüstü</strong> uygulamasını kullanın. Kurulum gerekmez; indirip
                  çalıştırın, ardından «Tarayıcıdan devam et» ile siteyi açın.
                </>
              )}
            </p>
            <DesktopAppDownload />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Portable sürüm (~73 MB) — Windows 64-bit
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {view === 'signup' && (
            <div>
              <label className="block text-gray-700 dark:text-gray-300 mb-2 text-sm">Ad soyad</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Adınız"
                  required
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-gray-700 dark:text-gray-300 mb-2 text-sm">Kullanıcı adı</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  const v = e.target.value;
                  // Giriş: e-posta veya kullanıcı adı; kayıt: yalnızca geçerli kullanıcı adı karakterleri
                  if (view === 'signin' && v.includes('@')) {
                    setUsername(v.trim().toLowerCase());
                  } else {
                    setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  }
                }}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder={view === 'signin' ? 'kullanici_adi veya eposta@ornek.com' : 'ornek_kullanici'}
                required
                minLength={3}
                maxLength={view === 'signin' ? 254 : 32}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 dark:text-gray-300 mb-2 text-sm">Şifre</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
                minLength={6}
                autoComplete={view === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          {view === 'signin' && (loginMode === 'web_allowed' || ENV_ALLOW_WEB) && (
            <WebRememberMeCheckbox checked={rememberMe} onChange={setRememberMe} />
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-500/20 border border-red-300 dark:border-red-500 text-red-700 dark:text-red-300 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {sessionLimited && view === 'signin' && (
            <button
              type="button"
              onClick={handleForceSessionLogin}
              disabled={loading || !username.trim() || !password}
              className="w-full py-2 rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-500/25 disabled:opacity-50"
            >
              Diğer oturumu kapat ve giriş yap
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2.5 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
          >
            {loading ? (
              'Lütfen bekleyin…'
            ) : view === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                Giriş yap
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Kayıt ol ve giriş yap
              </>
            )}
          </button>
        </form>
        )}

        {loginMode === 'web_allowed' || ENV_ALLOW_WEB ? (
          <div className="mt-4 text-center">
            <button type="button" onClick={onSwitchView} className="text-purple-600 dark:text-purple-400 hover:underline text-sm">
              {view === 'signin' ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten hesabınız var mı? Giriş yapın'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
