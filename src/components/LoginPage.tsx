import { useState, useEffect } from 'react';
import { fetchPublicSiteSettings } from '../utils/siteSettingsClient';
import { setStoredWebPresenceKey } from '../hooks/useWebPresence';
import { Shield, User, Lock, Sun, Moon } from 'lucide-react';
import { LoginSignInColumn } from './LoginSignInColumn';
import { apiFunctionsBase } from '../utils/supabase/info';
import { readResponseJson } from '../utils/readResponseJson';
import { useTheme } from '../contexts/ThemeContext';
import { SITE_LOGO_SRC } from '../constants/siteAssets';
import '../styles/modern-pages.css';

interface LoginPageProps {
  onSignIn: (token: string, user: any) => void;
  /** Yönetici paneli: web üzerinden giriş formu (normal kullanıcılar Electron) */
  allowWebSignIn?: boolean;
}

export function LoginPage({ onSignIn, allowWebSignIn = false }: LoginPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup'); // Default signup
  const [signupSuccess, setSignupSuccess] = useState('');
  const [sessionError, setSessionError] = useState<{ show: boolean; username: string; password: string }>({ show: false, username: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState<string>('');

  const requireElectron =
    !allowWebSignIn &&
    import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN !== 'false' &&
    import.meta.env.VITE_REQUIRE_ELECTRON_LOGIN !== '0';

  const handleForceLogin = async () => {
    setLoading(true);
    setError('');
    setSessionError({ show: false, username: '', password: '' });

    try {
      const response = await fetch(
        `${apiFunctionsBase}/signin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            username: sessionError.username, 
            password: sessionError.password,
            forceLogin: true // Tüm eski session'ları sil
          }),
        }
      );

      const data = await readResponseJson<{
        error?: string;
        accessToken?: string;
        user?: unknown;
        webPresenceKey?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(data.error || 'Giriş başarısız');
      }
      if (!data.accessToken || !data.user) {
        throw new Error(data.error || 'Sunucudan geçersiz yanıt (API çalışıyor mu?)');
      }

      persistWebPresence(data);
      onSignIn(data.accessToken, data.user);
    } catch (err: any) {
      setError(err.message || 'Force login başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSignupSuccess('');
    setSessionError({ show: false, username: '', password: '' });
    setLoading(true);

    try {
      if (mode === 'signup') {
        // Kayıt ol
        const response = await fetch(
          `${apiFunctionsBase}/signup`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, name, captchaToken }),
          }
        );

        const data = await readResponseJson<{ error?: string }>(response);

        if (!response.ok) {
          throw new Error(data.error || 'Kayıt başarısız');
        }

        if (requireElectron && !allowWebSignIn) {
          setSignupSuccess(
            'Kayıt alındı. Yönetici hesap ve cihaz onayından sonra masaüstü uygulamasından giriş yapabilirsiniz.',
          );
          setPassword('');
          setName('');
          return;
        }

        const signinResponse = await fetch(`${apiFunctionsBase}/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, forceLogin: true }),
        });
        const signinData = await readResponseJson<{ error?: string; accessToken?: string; user?: unknown }>(
          signinResponse,
        );
        if (!signinResponse.ok || !signinData.accessToken || !signinData.user) {
          throw new Error(signinData.error || 'Kayıt tamamlandı ancak otomatik giriş başarısız; giriş formunu kullanın.');
        }
        onSignIn(signinData.accessToken, signinData.user);
        setUsername('');
        setPassword('');
        setName('');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ilsa-page relative flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[10px] opacity-50">
          <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full mix-blend-multiply filter blur-xl animate-blob ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-300'}`}></div>
          <div className={`absolute top-1/3 right-1/4 w-96 h-96 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000 ${theme === 'dark' ? 'bg-pink-500' : 'bg-pink-300'}`}></div>
          <div className={`absolute bottom-1/4 left-1/3 w-96 h-96 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000 ${theme === 'dark' ? 'bg-blue-500' : 'bg-blue-300'}`}></div>
        </div>
      </div>

      <button
        type="button"
        className="absolute right-4 top-4 z-10 ilsa-modern-icon-btn ilsa-modern-theme-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Acik moda gec' : 'Koyu moda gec'}
        aria-label={theme === 'dark' ? 'Acik moda gec' : 'Koyu moda gec'}
      >
        {theme === 'dark' ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />}
      </button>

      <div className="relative w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={SITE_LOGO_SRC}
              alt="ILSA Support"
              className="mx-auto h-28 sm:h-36 md:h-44 w-auto max-w-[min(92vw,560px)] object-contain drop-shadow-lg"
              width={560}
              height={160}
              decoding="async"
            />
          </div>
          <h1 className="sr-only">ILSA Support</h1>
          <p className="ilsa-muted text-lg">
            Professional Firmware & Tools Platform
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Web Kayıt Formu - Solda */}
          <div className="ilsa-surface rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-8 h-8 text-purple-400" />
              <h2 className="text-2xl ilsa-title">Kayıt Ol</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">İsim</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    placeholder="Adınız Soyadınız"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">Kullanıcı adı</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500"
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {/* Turnstile geçici olarak devre dışı */}
              {/* <Turnstile
                sitekey={TURNSTILE_SITE_KEY}
                onVerify={(token) => setCaptchaToken(token)}
                theme="dark"
              /> */}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
              </button>
            </form>

            {signupSuccess && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-500/20 border border-green-300 dark:border-green-500/50 rounded-lg text-green-800 dark:text-green-200 text-sm">
                {signupSuccess}
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-50 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 rounded-lg text-red-700 dark:text-red-200 text-sm">
                {error}
              </div>
            )}
          </div>

          <LoginSignInColumn
            allowWebSignIn={allowWebSignIn}
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            loading={loading}
            setLoading={setLoading}
            error={error}
            setError={setError}
            sessionError={sessionError}
            setSessionError={setSessionError}
            onSignIn={onSignIn}
          />
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center space-y-4">
          <p className="text-gray-400 text-sm">
            🔐 Güvenli ve profesyonel firmware platformu
          </p>
        </div>
      </div>

      {/* Force Login Dialog */}
      {sessionError.show && (
        <div className="fixed inset-0 bg-black/55 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="ilsa-surface rounded-2xl border border-red-400/40 dark:border-red-500/50 max-w-md w-full p-8 shadow-2xl">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-red-400" />
              </div>
            </div>
            
            <h3 className="text-2xl ilsa-title text-center mb-4">
              Başka Bir Cihazda Aktif Oturum Var
            </h3>
            
            <p className="ilsa-muted text-center mb-6">
              Başka bir cihazda aktif oturumunuz var. Aynı anda sadece 10 oturum açabilirsiniz.
            </p>

            <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded-lg p-4 mb-6">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm text-center">
                ⚠️ Devam ederseniz, diğer cihazlardaki oturumlarınız sonlandırılacak.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSessionError({ show: false, username: '', password: '' })}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                onClick={handleForceLogin}
                disabled={loading}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Giriş yapılıyor...' : 'Yine de Giriş Yap'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
