import { Search, LogIn, UserPlus, LogOut, Menu, X, Settings, User, Download, Sun, Moon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { SITE_LOGO_SRC } from '../constants/siteAssets';
import { MembershipBadge } from './MembershipBadge';
import { CONTACT_MESSENGER_URL } from '../constants/contactLinks';
import { isAdminUser } from '../utils/membership';
import '../styles/modern-home.css';

const MESSENGER_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/3621/3621443.png';
/** Kendi dosya / Drive bağlantınız varsa burayı güncelleyin */
const VIRUS_TOOL_DOWNLOAD_URL = 'https://drive.google.com/file/d/1lLusXCrso2kdWPme1VOfuhhsV15ggLE7/view';
const SEARCH_HISTORY_KEY = 'ilsa-search-history';
const SEARCH_HISTORY_LIMIT = 8;
/** Yazma durduktan bu kadar ms sonra arama geçmişine eklenir */
const SEARCH_HISTORY_DEBOUNCE_MS = 600;

interface HeaderProps {
  user: any;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onShowPremium?: () => void;
  onShowAdmin?: () => void;
  onShowProfile?: () => void;
  onShowDownloadHistory?: () => void;
  onShowLatestFiles?: () => void;
  onShowInfoPages?: () => void;
  onShowPackagePricing?: () => void;
  onShowFavorites?: () => void;
  onShowFileRequest?: () => void;
  /** Ana sayfa görünümü (marka seçimi, alt sayfalar sıfırlanır) */
  onGoHome?: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  /** Arama sonuçları görünümünde üst arama kutusunu odakla */
  autoFocusSearch?: boolean;
}

export function Header({ 
  user, 
  onSignIn, 
  onSignUp, 
  onSignOut, 
  onShowAdmin,
  onShowProfile,
  onShowDownloadHistory,
  onShowLatestFiles,
  onShowInfoPages,
  onShowPackagePricing,
  onShowFavorites,
  onShowFileRequest,
  onGoHome,
  searchTerm,
  onSearchChange,
  autoFocusSearch,
}: HeaderProps) {
  const fileSearchInputRef = useRef<HTMLInputElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, SEARCH_HISTORY_LIMIT);
      setSearchHistory(normalized);
    } catch (error) {
      console.warn('Arama geçmişi okunamadı:', error);
    }
  }, []);

  const addSearchToHistory = useCallback((rawValue: string) => {
    const term = rawValue.trim();
    if (!term) return;
    setSearchHistory((prev) => {
      const updated = [term, ...prev.filter((item) => item.toLocaleLowerCase('tr-TR') !== term.toLocaleLowerCase('tr-TR'))]
        .slice(0, SEARCH_HISTORY_LIMIT);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch (error) {
        console.warn('Arama geçmişi kaydedilemedi:', error);
      }
      return updated;
    });
  }, []);

  const removeSearchHistoryItem = useCallback((termToRemove: string) => {
    setSearchHistory((prev) => {
      const updated = prev.filter(
        (item) => item.toLocaleLowerCase('tr-TR') !== termToRemove.toLocaleLowerCase('tr-TR'),
      );
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch (error) {
        console.warn('Arama geçmişi güncellenemedi:', error);
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;
    const id = window.setTimeout(() => {
      addSearchToHistory(term);
    }, SEARCH_HISTORY_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchTerm, addSearchToHistory]);

  useEffect(() => {
    if (!autoFocusSearch) return;
    const id = window.requestAnimationFrame(() => {
      fileSearchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoFocusSearch]);

  const handleAnasayfa = () => {
    onGoHome?.();
    if (!onGoHome) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleYeniler = () => {
    onSearchChange('');
    setShowHistoryMenu(false);
    setMobileMenuOpen(false);
    if (onShowLatestFiles) {
      onShowLatestFiles();
      return;
    }
    handleAnasayfa();
  };

  const handleDuyurular = () => {
    if (onShowInfoPages) {
      onShowInfoPages();
      return;
    }
    handleAnasayfa();
  };

  const handleFiyatlar = () => {
    setMobileMenuOpen(false);
    if (onShowPackagePricing) {
      onShowPackagePricing();
      return;
    }
    handleAnasayfa();
  };

  const handleFavoriler = () => {
    setMobileMenuOpen(false);
    if (onShowFavorites) {
      onShowFavorites();
      return;
    }
    handleAnasayfa();
  };

  const handleDosyaIste = () => {
    setMobileMenuOpen(false);
    if (onShowFileRequest) {
      onShowFileRequest();
      return;
    }
    handleAnasayfa();
  };

  const filteredHistory = searchHistory.filter((term) =>
    term.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR')),
  );

  return (
    <header className="ilsa-modern-navbar">
      <button type="button" className="ilsa-modern-logo ilsa-modern-logo-btn" onClick={handleAnasayfa} aria-label="Anasayfa">
        <img src={SITE_LOGO_SRC} alt="ILSA Support" className="ilsa-modern-logo-mark" width={360} height={72} decoding="async" />
      </button>

      <nav className="ilsa-modern-menu hidden md:flex">
        <button type="button" onClick={handleAnasayfa}>ANASAYFA</button>
        <button type="button" onClick={handleYeniler}>EN YENİLER</button>
        <button type="button" onClick={handleFiyatlar}>FİYATLAR</button>
        <button type="button" onClick={handleFavoriler}>FAVORİLERİM</button>
        <button type="button" onClick={handleDosyaIste}>DOSYA İSTE</button>
        <button
          type="button"
          onClick={() => window.open(VIRUS_TOOL_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')}
        >
          VİRÜS TOOL
        </button>
        <button
          type="button"
          onClick={() => window.open(CONTACT_MESSENGER_URL, '_blank', 'noopener,noreferrer')}
        >
          İLETİŞİM
        </button>
      </nav>

      <div className="ilsa-modern-nav-actions">
        <div className="relative hidden md:block">
          <label className="ilsa-modern-top-search">
            <Search size={14} />
            <input
              ref={fileSearchInputRef}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setShowHistoryMenu(true)}
              onBlur={() => {
                window.setTimeout(() => setShowHistoryMenu(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addSearchToHistory(searchTerm);
                  setShowHistoryMenu(false);
                }
              }}
              placeholder="Dosya ara..."
            />
          </label>
          {showHistoryMenu && filteredHistory.length > 0 && (
            <div className="absolute z-[10001] mt-2 w-full rounded-none border border-gray-300 bg-white shadow-2xl">
              {filteredHistory.map((term) => (
                <div key={term} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                  <button
                    type="button"
                    className="flex-1 text-left text-sm text-gray-800 hover:text-gray-900"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSearchChange(term);
                      setShowHistoryMenu(false);
                    }}
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-red-500"
                    title="Geçmişten kaldır"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      removeSearchHistoryItem(term);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="ilsa-modern-icon-btn ilsa-modern-theme-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Acik moda gec' : 'Koyu moda gec'}
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />}
        </button>

        {user ? (
          <>
            {onShowDownloadHistory && (
              <button type="button" className="ilsa-modern-icon-btn" onClick={onShowDownloadHistory}>
                <Download size={16} />
              </button>
            )}
            {onShowProfile && (
              <button type="button" className="ilsa-modern-profile-btn" onClick={onShowProfile}>
                <User size={14} />
                <span className="ilsa-profile-name-row">
                  <span>{user.name || user.username || 'Kullanici'}</span>
                  <MembershipBadge user={user} accessToken={null} />
                </span>
              </button>
            )}
            {isAdminUser(user) && onShowAdmin && (
              <button type="button" className="ilsa-modern-admin-btn" onClick={onShowAdmin}>
                <Settings size={13} /> YÖNETİM PANELİ
              </button>
            )}
            <button type="button" className="ilsa-modern-logout-btn" onClick={onSignOut}>
              <LogOut size={13} /> ÇIKIŞ YAP
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ilsa-modern-profile-btn" onClick={onSignIn}>
              <LogIn size={14} /> GİRİŞ
            </button>
            <button type="button" className="ilsa-modern-admin-btn" onClick={onSignUp}>
              <UserPlus size={14} /> KAYIT
            </button>
          </>
        )}

        <button
          type="button"
          className="md:hidden ilsa-modern-icon-btn"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden mt-3 w-full rounded-xl border border-gray-300 bg-white dark:border-white/10 dark:bg-[#0f1b2f] p-3 space-y-2">
          <button type="button" className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-white" onClick={handleAnasayfa}>ANASAYFA</button>
          <button type="button" className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-white" onClick={handleYeniler}>EN YENİLER</button>
          <button type="button" className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-white" onClick={handleFiyatlar}>FİYATLAR</button>
          <button type="button" className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-white" onClick={handleFavoriler}>FAVORİLERİM</button>
          <button type="button" className="w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-900 dark:border-white/15 dark:bg-white/5 dark:text-white" onClick={handleDosyaIste}>DOSYA İSTE</button>
        </div>
      )}

    </header>
  );
}