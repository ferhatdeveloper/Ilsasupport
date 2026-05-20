import { useState, useRef } from 'react';
import { LayoutDashboard, FolderOpen, Upload, Users, LogOut, Home, Video, Sun, Moon, LayoutTemplate, CreditCard, FileQuestion, Settings } from 'lucide-react';
import { AdminSettingsPage } from './admin/AdminSettingsPage';
import { AdminFileRequestsPage } from './admin/AdminFileRequestsPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminFilesPage } from './admin/AdminFilesPage';
import { AdminCategoriesPage } from './admin/AdminCategoriesPage';
import { AdminStatsPage } from './admin/AdminStatsPage';
import { AdminContentPage } from './admin/AdminContentPage';
import { AdminPricingPage } from './admin/AdminPricingPage';
import { RemoteSupportPanel } from './RemoteSupportPanel';
import { useTheme } from '../contexts/ThemeContext';
import { SITE_LOGO_SRC } from '../constants/siteAssets';
import '../styles/modern-pages.css';

interface AdminDashboardProps {
  user: any;
  onSignOut: () => void;
  /** Tam sayfa yenileme yapmadan ana siteye dön (oturum korunur) */
  onGoHome?: () => void;
}

export function AdminDashboard({ user, onSignOut, onGoHome }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    | 'stats'
    | 'categories'
    | 'files'
    | 'users'
    | 'support'
    | 'content'
    | 'pricing'
    | 'file-requests'
    | 'settings'
  >('users');
  const [activeSupportId, setActiveSupportId] = useState<string | null>(null);
  const supportIdInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();

  const tabs = [
    { id: 'stats', label: 'Özet', icon: LayoutDashboard },
    { id: 'content', label: 'İçerik (Slayt / Bilgi)', icon: LayoutTemplate },
    { id: 'pricing', label: 'Paket fiyatları', icon: CreditCard },
    { id: 'categories', label: 'Kategoriler', icon: FolderOpen },
    { id: 'files', label: 'Dosyalar', icon: Upload },
    { id: 'file-requests', label: 'Dosya istekleri', icon: FileQuestion },
    { id: 'users', label: 'Kullanıcılar', icon: Users },
    { id: 'settings', label: 'Ayarlar', icon: Settings },
    { id: 'support', label: 'Uzaktan destek', icon: Video },
  ];

  const isDark = theme === 'dark';

  return (
    <div className="ilsa-page flex">
      {/* Sidebar: koyu zeminde kalan sınıflar .light .text-white ile bozulmasın diye temaya göre ayrı renkler */}
      <aside
        className={
          isDark
            ? 'w-64 shrink-0 flex flex-col bg-[#0f1b2f] border-r border-white/10'
            : 'w-64 shrink-0 flex flex-col bg-slate-100 border-r border-slate-200 shadow-[inset_-1px_0_0_rgba(15,23,42,0.06)]'
        }
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <img
              src={SITE_LOGO_SRC}
              alt=""
              className={
                isDark
                  ? 'h-12 sm:h-14 w-auto max-w-[240px] object-contain brightness-110 drop-shadow-md shrink-0'
                  : 'h-12 sm:h-14 w-auto max-w-[240px] object-contain shrink-0'
              }
              width={240}
              height={56}
              decoding="async"
            />
            <div>
              <div className={isDark ? 'text-white text-lg font-bold' : 'text-slate-900 text-lg font-bold'}>
                ILSA Support
              </div>
              <div className={isDark ? 'text-xs text-purple-400' : 'text-xs text-purple-600'}>Admin Panel</div>
            </div>
          </div>

          <nav className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-red-600 text-white'
                    : isDark
                      ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-200/90 hover:text-slate-900'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div
          className={
            isDark ? 'mt-auto p-6 border-t border-white/10 space-y-3' : 'mt-auto p-6 border-t border-slate-200 space-y-3'
          }
        >
          <button
            onClick={toggleTheme}
            className={
              isDark
                ? 'flex items-center gap-2 w-full px-4 py-3 text-gray-200 hover:bg-white/10 rounded-lg transition-colors'
                : 'flex items-center gap-2 w-full px-4 py-3 text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors'
            }
            title={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
            type="button"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{isDark ? 'Açık tema' : 'Koyu tema'}</span>
          </button>

          <button
            onClick={() => {
              if (onGoHome) {
                onGoHome();
              } else {
                window.location.href = '/';
              }
            }}
            className={
              isDark
                ? 'flex items-center gap-2 w-full px-4 py-3 text-gray-200 hover:bg-white/10 rounded-lg transition-colors'
                : 'flex items-center gap-2 w-full px-4 py-3 text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors'
            }
            type="button"
          >
            <Home className="w-5 h-5" />
            <span>Ana Sayfa</span>
          </button>

          <div className="flex items-center gap-3">
            <div
              className={
                isDark
                  ? 'w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center'
                  : 'w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center text-slate-800 font-medium text-sm'
              }
            >
              {isDark ? (
                <span className="text-white text-sm">{(user.name || user.username || '?')[0]}</span>
              ) : (
                <span>{(user.name || user.username || '?')[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={isDark ? 'text-white text-sm truncate' : 'text-slate-900 text-sm truncate'}>
                {user.name}
              </div>
              <div className={isDark ? 'text-xs text-gray-400' : 'text-xs text-slate-500'}>Administrator</div>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            type="button"
          >
            <LogOut className="w-4 h-4" />
            Çıkış
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'stats' && <AdminStatsPage />}
        {activeTab === 'content' && <AdminContentPage />}
        {activeTab === 'pricing' && <AdminPricingPage />}
        {activeTab === 'categories' && <AdminCategoriesPage />}
        {activeTab === 'files' && <AdminFilesPage />}
        {activeTab === 'file-requests' && <AdminFileRequestsPage />}
        {activeTab === 'users' && <AdminUsersPage />}
        {activeTab === 'settings' && <AdminSettingsPage />}
        {activeTab === 'support' && (
          <div className="p-8">
            <div className="text-white">
              <h2 className="text-2xl mb-4">🎥 Uzaktan Destek - WebRTC P2P</h2>
              <p className="text-gray-400 mb-6">
                Electron uygulamasındaki kullanıcılara uzaktan destek sağlayın. 
                Bağlantı peer-to-peer (P2P) olarak kurulur.
              </p>
              
              <div className="bg-gray-800 p-6 rounded-lg mb-6 border border-gray-700">
                <h3 className="text-lg mb-4">Test Desteği Başlat</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Electron uygulamasında oturum açmış bir kullanıcının destek ID'sini girin:
                </p>
                <div className="flex gap-4">
                  <input
                    ref={supportIdInputRef}
                    type="text"
                    placeholder="Support ID (örn: SUPP-ABC123)"
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = supportIdInputRef.current?.value?.trim();
                        if (v) setActiveSupportId(v);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = supportIdInputRef.current?.value?.trim();
                      if (v) setActiveSupportId(v);
                    }}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
                  >
                    Bağlan
                  </button>
                </div>
              </div>

              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                <h4 className="text-blue-400 mb-2">ℹ️ Nasıl Kullanılır?</h4>
                <ol className="text-sm text-gray-300 space-y-2">
                  <li>1. Kullanıcı Electron uygulamasında oturum açar</li>
                  <li>2. Kullanıcının destek penceresinde Support ID görüntülenir</li>
                  <li>3. Support ID'yi yukarıdaki alana girin ve "Bağlan" tıklayın</li>
                  <li>4. Kullanıcı izin verirse P2P bağlantı kurulur</li>
                  <li>5. Kullanıcının ekranını görüntüleyebilir ve kontrol edebilirsiniz</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* WebRTC Remote Support Panel */}
      {activeSupportId && (
        <RemoteSupportPanel supportId={activeSupportId} onClose={() => setActiveSupportId(null)} />
      )}
    </div>
  );
}