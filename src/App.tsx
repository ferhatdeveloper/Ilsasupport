import { useState, useEffect } from 'react';
import { apiFunctionsBase } from './utils/supabase/info';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { AdminDashboard } from './components/AdminDashboard';
import { ThemeProvider } from './contexts/ThemeContext';
import { SeoHead } from './components/SeoHead';
import { SEO_DEFAULT_DESCRIPTION, SEO_SITE_NAME } from './constants/seoDefaults';
import {
  setSecureToken,
  setHardwareId,
  setSignPort,
  installSignedFetchBridge,
  hasValidToken,
  getLocalUser,
  clearSecureToken,
  applyJwtFromProfile,
  hydrateSecureSession,
  refreshUserMembership,
  notifySecureLogout,
  isElectronShell,
} from './utils/secureApi';
import {
  readBrowserHandoffFromLocation,
  readDesktopAuthFromLocation,
  stripDesktopAuthFromLocation,
} from './utils/desktopAuthParams';
import { toast } from 'sonner@2.0.3';
import { cleanupExpiredTokens } from './utils/tokenCrypto';
import { readResponseJson } from './utils/readResponseJson';
import {
  clearStoredJwtAccessToken,
  getStoredJwtAccessToken,
  isJwtAccessToken,
  sanitizeLegacyAccessTokenStorage,
  setStoredJwtAccessToken,
} from './utils/authTokens';
import { applyAccessTokenRotation } from './utils/secureApi';
import { Toaster } from 'sonner@2.0.3';
import { SubscriptionExpiryToasts } from './components/SubscriptionExpiryToasts';
import { useWebPresence, setStoredWebPresenceKey } from './hooks/useWebPresence';
import { useNewFileToast } from './hooks/useNewFileToast';
import { fetchPublicSiteSettings } from './utils/siteSettingsClient';

export default function App() {
  return (
    <ThemeProvider>
      <>
        <AppContent />
        <Toaster richColors position="top-right" closeButton />
      </>
    </ThemeProvider>
  );
}

function AppContent() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'home' | 'admin'>('home');
  const [secureMode, setSecureMode] = useState(false); // Secure token sistemi aktif mi?
  const [heartbeatSec, setHeartbeatSec] = useState(45);

  useEffect(() => {
    void fetchPublicSiteSettings().then((s) => setHeartbeatSec(s.webSessionHeartbeatSeconds));
  }, []);

  useWebPresence(user, heartbeatSec);
  useNewFileToast(user);

  useEffect(() => {
    const disableContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener('contextmenu', disableContextMenu);
    return () => {
      document.removeEventListener('contextmenu', disableContextMenu);
    };
  }, []);

  useEffect(() => {
    const onJwtRotated = (event: Event) => {
      const token = (event as CustomEvent<string>).detail;
      if (token && isJwtAccessToken(token)) setAccessToken(token);
    };
    const onSecureRotated = () => {
      const jwt = getStoredJwtAccessToken();
      if (jwt) setAccessToken(jwt);
    };
    const onUserUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail === 'object') setUser(detail);
      else {
        const local = getLocalUser();
        if (local) setUser(local);
      }
    };
    window.addEventListener('ilsa-jwt-rotated', onJwtRotated);
    window.addEventListener('ilsa-secure-token-rotated', onSecureRotated);
    window.addEventListener('ilsa-user-updated', onUserUpdated);
    return () => {
      window.removeEventListener('ilsa-jwt-rotated', onJwtRotated);
      window.removeEventListener('ilsa-secure-token-rotated', onSecureRotated);
      window.removeEventListener('ilsa-user-updated', onUserUpdated);
    };
  }, []);

  const goToHomeView = () => {
    setView('home');
    window.history.pushState({}, '', '/');
  };

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setView(params.get('view') === 'admin' ? 'admin' : 'home');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      cleanupExpiredTokens();
      sanitizeLegacyAccessTokenStorage();

      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'admin') {
        setView('admin');
      }

      const electronBoot =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('ilsaElectronBoot') === '1';
      if (electronBoot && hasValidToken()) {
        setSecureMode(true);
        installSignedFetchBridge();
        const refreshed = await refreshUserMembership();
        const localUser = refreshed ?? getLocalUser();
        if (localUser) {
          if (!cancelled) setUser(localUser);
          const jwt = getStoredJwtAccessToken();
          if (jwt && !cancelled) setAccessToken(jwt);
          sessionStorage.removeItem('ilsaElectronBoot');
          window.history.replaceState({}, '', stripDesktopAuthFromLocation());
          if (!cancelled) setLoading(false);
          return;
        }
      }

      const browserHandoff = readBrowserHandoffFromLocation();
      if (browserHandoff) {
        await handleBrowserHandoff(browserHandoff);
        return;
      }

      const desktopAuth = readDesktopAuthFromLocation();
      if (desktopAuth.secureToken && desktopAuth.hwId) {
        await handleSecureToken(
          desktopAuth.secureToken,
          desktopAuth.hwId,
          desktopAuth.signPort,
          desktopAuth.electronShell,
        );
        return;
      }

      const electronToken = params.get('token');
      if (electronToken) {
        await handleElectronToken(electronToken);
        return;
      }

      if (hasValidToken()) {
        const localUser = getLocalUser();
        if (localUser) {
          setUser(localUser);
          setSecureMode(true);
          installSignedFetchBridge();
          const existingJwt = getStoredJwtAccessToken();
          if (existingJwt) setAccessToken(existingJwt);

          const hydrated = await hydrateSecureSession();
          if (!cancelled && hydrated) {
            setUser(hydrated.user);
            if (hydrated.accessToken) setAccessToken(hydrated.accessToken);
          } else if (!cancelled) {
            const jwt = getStoredJwtAccessToken();
            if (jwt) setAccessToken(jwt);
            const refreshed = await refreshUserMembership();
            if (refreshed) setUser(refreshed);
          }
          if (!cancelled) setLoading(false);
          return;
        }
      }

      await checkSession();
      if (!cancelled) setLoading(false);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSecureToken = async (
    token: string,
    hwId: string,
    port: number | null,
    fromElectronShell = false,
  ) => {
    try {
      setLoading(true);
      
      setSecureToken(token);
      setHardwareId(hwId);
      const canSign = fromElectronShell || isElectronShell() || port != null;
      if (!canSign) {
        alert(
          'Güvenli oturum için masaüstü uygulaması gerekli. Lütfen ILSA Support portable ile tekrar giriş yapın.',
        );
        clearSecureToken();
        setLoading(false);
        return;
      }
      if (port) setSignPort(port);
      installSignedFetchBridge();

      const { getSecureProfile } = await import('./utils/secureApi');
      const result = await getSecureProfile();
      
      if (result.success && result.data?.user) {
        setSecureMode(true);

        const jwt = applyJwtFromProfile(result.data);
        if (jwt) setAccessToken(jwt);

        const refreshed = await refreshUserMembership();
        const nextUser = refreshed ?? result.data.user;
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));

        window.history.replaceState({}, '', stripDesktopAuthFromLocation());
      } else {
        console.error('❌ Secure token hatası:', result.error);
        alert(`Giriş başarısız: ${result.error || 'Bilinmeyen hata'}`);
        clearSecureToken();
      }
    } catch (error) {
      console.error('❌ Secure token işleme hatası:', error);
      alert(`Giriş başarısız: ${error}`);
      clearSecureToken();
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserHandoff = async (handoffId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${apiFunctionsBase}/redeem-browser-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoffId }),
      });

      const result = await readResponseJson<{
        success?: boolean;
        accessToken?: string;
        user?: unknown;
        error?: string;
        errorCode?: string;
      }>(response);

      if (response.ok && result.success && result.accessToken) {
        clearSecureToken();
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('hardwareId');
        }
        setAccessToken(result.accessToken);
        setUser(result.user);
        setSecureMode(false);
        if (isJwtAccessToken(result.accessToken)) {
          setStoredJwtAccessToken(result.accessToken);
        }
        localStorage.setItem('user', JSON.stringify(result.user));
        window.history.replaceState({}, '', stripDesktopAuthFromLocation());
        toast.success('Tarayıcı oturumu açıldı', {
          description:
            'Masaüstü uygulamasındaki tam indirme koruması tarayıcıda kullanılamaz; dosya indirme JWT ile çalışır.',
          duration: 8000,
        });
      } else {
        toast.error(result.error || 'Tarayıcı oturumu açılamadı', {
          description: 'Masaüstü uygulamasından «Tarayıcıdan devam et» ile tekrar deneyin.',
        });
      }
    } catch (error) {
      console.error('Browser handoff hatası:', error);
      toast.error('Tarayıcı oturumu açılamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleElectronToken = async (electronToken: string) => {
    try {
      setLoading(true);
      
      console.log('🔍 Electron token validation başlıyor...');
      
      const response = await fetch(
        `${apiFunctionsBase}/validate-electron-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ electronToken }),
        }
      );

      const result = await readResponseJson<{
        success?: boolean;
        accessToken?: string;
        user?: unknown;
        error?: string;
      }>(response);

      if (response.ok && result.success) {
        console.log('✅ Token validation başarılı:', result);
        
        // Access token'ı set et
        setAccessToken(result.accessToken);
        setUser(result.user);
        
        // LocalStorage'a kaydet
        if (result.accessToken && isJwtAccessToken(result.accessToken)) {
          setStoredJwtAccessToken(result.accessToken);
          setAccessToken(result.accessToken);
        }
        localStorage.setItem('user', JSON.stringify(result.user));
        
        // URL'den token'ı temizle
        window.history.replaceState({}, '', window.location.pathname);
        
        console.log('✅ Electron ile giriş tamamlandı');
      } else {
        console.error('❌ Electron token hatası:', result);
        alert(`Giriş başarısız: ${result.error || 'Bilinmeyen hata'}`);
      }
    } catch (error) {
      console.error('❌ Electron token işleme hatası:', error);
      alert(`Giriş başarısız: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const checkSession = async () => {
    try {
      // 1️⃣ Önce localStorage'dan kontrol et
      const savedToken = getStoredJwtAccessToken();
      const savedUser = localStorage.getItem('user');
      
      if (savedToken && savedUser) {
        console.log('🔍 LocalStorage\'dan token bulundu, doğrulanıyor...');
        
        // Token hala geçerli mi kontrol et
        const response = await fetch(
          `${apiFunctionsBase}/verify-session`,
          {
            headers: {
              Authorization: `Bearer ${savedToken}`,
            },
          }
        );

        if (response.ok) {
          applyAccessTokenRotation(response);
          const freshJwt = getStoredJwtAccessToken() || savedToken;
          const result = await readResponseJson<{ user?: { email?: string; username?: string } }>(response);
          if (!result.user) {
            console.log('🔄 Session yanıtı geçersiz, localStorage temizleniyor...');
            clearStoredJwtAccessToken();
            localStorage.removeItem('user');
          } else {
            setAccessToken(freshJwt);
            setUser(result.user);
            localStorage.setItem('user', JSON.stringify(result.user));
            console.log('✅ Kullanıcı otomatik giriş yaptı:', result.user.username ?? result.user.email);
            setLoading(false);
            return;
          }
        } else {
          console.log('🔄 Token geçersiz, localStorage temizleniyor...');
          clearStoredJwtAccessToken();
          localStorage.removeItem('user');
        }
      }

      console.log('ℹ️ Aktif session bulunamadı, giriş sayfası gösteriliyor');
    } catch (error) {
      console.error('❌ Session kontrol hatası:', error);
      clearStoredJwtAccessToken();
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = (token: string, userData: any) => {
    setUser(userData);
    if (isJwtAccessToken(token)) {
      clearSecureToken();
      setSecureMode(false);
      setAccessToken(token);
      setStoredJwtAccessToken(token);
    }
    localStorage.setItem('user', JSON.stringify(userData));
    
    console.log('✅ Kullanıcı giriş yaptı ve localStorage\'a kaydedildi:', userData);
  };

  const handleSignOut = async () => {
    try {
      await notifySecureLogout();
      const jwt = getStoredJwtAccessToken();
      if (jwt) {
        await fetch(`${apiFunctionsBase}/signout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        });
      }

      setAccessToken(null);
      setUser(null);
      setView('home');

      clearStoredJwtAccessToken();
      clearSecureToken();
      localStorage.removeItem('user');
      setStoredWebPresenceKey(null);

      window.history.pushState({}, '', '/');

      console.log('✅ Kullanıcı çıkış yaptı ve localStorage temizlendi');
    } catch (error) {
      console.error('Çıkış hatası:', error);
    }
  };

  if (loading) {
    return (
      <>
        <SeoHead
          title={`Yükleniyor — ${SEO_SITE_NAME}`}
          description={SEO_DEFAULT_DESCRIPTION}
          noindex
        />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-white">Loading...</p>
        </div>
      </div>
      </>
    );
  }

  // Admin panele erişim kontrolü
  if (view === 'admin') {
    if (!user) {
      // Giriş yapmamış - Login sayfasına yönlendir
      return (
        <>
          <SeoHead
            title={`Yönetici girişi — ${SEO_SITE_NAME}`}
            description="ILSA Support yönetim paneli için oturum açın."
            noindex
          />
          <LoginPage onSignIn={handleSignIn} allowWebSignIn />
        </>
      );
    }
    
    const isAdmin = user.role === 'admin' || user.plan === 'admin';
    if (!isAdmin) {
      // Admin değil
      return (
        <>
          <SeoHead
            title={`Erişim reddedildi — ${SEO_SITE_NAME}`}
            description="Bu alan yalnızca yöneticiler içindir."
            noindex
          />
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
          <div className="text-center bg-gray-800 p-8 rounded-lg max-w-md">
            <div className="text-6xl mb-4">⛔</div>
            <h2 className="text-white text-2xl mb-4">Access Denied</h2>
            <p className="text-gray-400 mb-6">Only administrators can access this panel</p>
            <button
              onClick={goToHomeView}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Go to Homepage
            </button>
          </div>
        </div>
        </>
      );
    }

    const adminJwt = getStoredJwtAccessToken() || (accessToken && isJwtAccessToken(accessToken) ? accessToken : null);
    if (!adminJwt) {
      return (
        <>
          <SeoHead
            title={`Oturum hazırlanıyor — ${SEO_SITE_NAME}`}
            description="Yönetim paneli oturumu yükleniyor."
            noindex
          />
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900">
            <div className="text-center bg-gray-800 p-8 rounded-lg max-w-md">
              <div className="text-6xl mb-4">⏳</div>
              <h2 className="text-white text-2xl mb-4">Yönetici girişi gerekli</h2>
              <p className="text-gray-400 mb-6">
                Yönetim paneli için web üzerinden admin hesabıyla giriş yapın (masaüstü oturumu yeterli değildir).
              </p>
              <button
                type="button"
                onClick={() => {
                  clearStoredJwtAccessToken();
                  setAccessToken(null);
                  setUser(null);
                }}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Giriş sayfasına git
              </button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <SeoHead
          title={`Yönetim paneli — ${SEO_SITE_NAME}`}
          description="ILSA Support yönetici arayüzü."
          noindex
          path="/?view=admin"
        />
        <SubscriptionExpiryToasts user={user} />
        <AdminDashboard user={user} onSignOut={handleSignOut} onGoHome={goToHomeView} />
      </>
    );
  }

  // Anasayfa: giriş zorunlu değil; indirme / premium vb. bileşenler kendi içinde yetki kontrolü yapar
  return (
    <>
      <SubscriptionExpiryToasts user={user} />
      <HomePage
        user={user}
        accessToken={accessToken}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onShowAdmin={() => {
          setView('admin');
          window.history.pushState({ view: 'admin' }, '', '/?view=admin');
        }}
      />
    </>
  );
}