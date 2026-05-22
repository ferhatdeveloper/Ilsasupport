import { useState, useEffect } from 'react';
import { Header } from './Header';
import { CategoryGrid } from './CategoryGrid';
import { SubcategoryGrid } from './SubcategoryGrid';
import { FileList } from './FileList';
import { AuthModal } from './AuthModal';
import { PremiumModal } from './PremiumModal';
import { ProfilePage } from './ProfilePage';
import { DownloadHistory } from './DownloadHistory';
import { LatestFilesPage } from './LatestFilesPage';
import { FavoritesPage } from './FavoritesPage';
import { FileRequestPage } from './FileRequestPage';
import { InfoPagesPublic } from './InfoPagesPublic';
import { PackagePricingPage } from './PackagePricingPage';
import { Footer } from './Footer';
import { ModernBreadcrumb } from './ModernBreadcrumb';
import { ModernHomeHero } from './ModernHomeHero';
import { SITE_LOGO_SRC } from '../constants/siteAssets';
import { apiFunctionsBase } from '../utils/supabase/info';
import { isLoggedIn } from '../utils/secureApi';
import { isAdminUser, PREMIUM_UPSELL_ENABLED } from '../utils/membership';
import { MembershipBadge } from './MembershipBadge';
import { CONTACT_MESSENGER_URL } from '../constants/contactLinks';
import { fetchBrandMarkaPaths, resolveBrandIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, Download } from 'lucide-react';
import '../styles/modern-home.css';
import { applySeo } from '../utils/seoDom';
import { SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_TITLE, SEO_SITE_NAME } from '../constants/seoDefaults';

/** Header "DOSYA ARA" kutusu — sayfa yenilense de metin kalır */
const FILE_SEARCH_QUERY_KEY = 'ilsa-file-search-query';
const SEARCH_DEBOUNCE_MS = 1400;

function readStoredSearchQuery(): string {
  try {
    const raw = localStorage.getItem(FILE_SEARCH_QUERY_KEY);
    return raw != null ? String(raw) : '';
  } catch {
    return '';
  }
}

interface HomePageProps {
  user: any | null;
  accessToken: string | null;
  onSignIn: (token: string, user: any) => void;
  onSignOut: () => void;
  onShowAdmin?: () => void;
}

export function HomePage({ user, accessToken, onSignIn, onSignOut, onShowAdmin }: HomePageProps) {
  const { theme, toggleTheme } = useTheme();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const openPremiumModal = () => {
    if (PREMIUM_UPSELL_ENABLED) setShowPremiumModal(true);
  };
  const [showProfilePage, setShowProfilePage] = useState(false);
  const [showDownloadHistory, setShowDownloadHistory] = useState(false);
  const [showLatestFilesPage, setShowLatestFilesPage] = useState(false);
  const [showFavoritesPage, setShowFavoritesPage] = useState(false);
  const [showFileRequestPage, setShowFileRequestPage] = useState(false);
  const [showInfoPages, setShowInfoPages] = useState(false);
  const [showPackagePricing, setShowPackagePricing] = useState(false);
  const [authView, setAuthView] = useState<'signin' | 'signup'>('signin');
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [categoryTrail, setCategoryTrail] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [navigatedFromSearch, setNavigatedFromSearch] = useState(false);
  const [searchReturnTerm, setSearchReturnTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState(readStoredSearchQuery);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(readStoredSearchQuery);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);
  const [brandMarkaPaths, setBrandMarkaPaths] = useState<BrandMarkaPaths | null>(null);

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    fetchBrandMarkaPaths().then(setBrandMarkaPaths);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILE_SEARCH_QUERY_KEY, searchTerm);
    } catch {
      /* depolama dolu veya kapalı olabilir */
    }
  }, [searchTerm]);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setDebouncedSearchTerm('');
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    if (selectedBrand) {
      loadCategories(selectedBrand);
    } else {
      setCategories([]);
      setSelectedCategory(null);
      setSubcategories([]);
      setSelectedSubcategory(null);
    }
  }, [selectedBrand]);

  useEffect(() => {
    if (selectedCategory) {
      loadSubcategories(selectedCategory);
    } else {
      setSubcategories([]);
      setSelectedSubcategory(null);
    }
  }, [selectedCategory]);

  const loadBrands = async () => {
    try {
      console.log('🏢 Markalar yükleniyor...');
      const response = await fetch(`${apiFunctionsBase}/brands`);

      console.log('📡 Brands response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Brands data:', data);
        console.log('📊 Toplam marka sayısı:', data.brands?.length || 0);
        setBrands(data.brands || []);
      } else {
        console.error('❌ Brands response error:', response.status, await response.text());
      }
    } catch (error) {
      console.error('❌ Marka yükleme hatası:', error);
    }
  };

  const loadCategories = async (brandId: string) => {
    try {
      setLoadingCategories(true);
      console.log('📂 Kategoriler yükleniyor... brandId:', brandId);
      const response = await fetch(
        `${apiFunctionsBase}/categories?brandId=${brandId}`
      );

      console.log('📡 Categories response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Categories data:', data);
        console.log('📊 Toplam kategori sayısı:', data.categories?.length || 0);
        setCategories(data.categories || []);
      } else {
        console.error('❌ Categories response error:', response.status, await response.text());
      }
    } catch (error) {
      console.error('❌ Kategori yükleme hatası:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  /** Klasör gezintisinde üst arama kutusu dosya listesini ezmesin */
  const clearFileSearch = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
  };

  const openSubcategoryFiles = (subcategoryId: string) => {
    clearFileSearch();
    setSelectedSubcategory(subcategoryId);
  };

  /** Alt klasörde başka seviye var mı (yaprak ise dosya listesine geç) */
  const subcategoryHasChildren = async (subcategoryId: string): Promise<boolean> => {
    try {
      const response = await fetch(
        `${apiFunctionsBase}/subcategories?categoryId=${subcategoryId}`,
      );
      if (!response.ok) return false;
      const data = await response.json();
      return (data.subcategories || []).length > 0;
    } catch {
      return false;
    }
  };

  const loadSubcategories = async (categoryId: string) => {
    try {
      setLoadingSubcategories(true);
      const response = await fetch(
        `${apiFunctionsBase}/subcategories?categoryId=${categoryId}`
      );

      if (response.ok) {
        const data = await response.json();
        let subs = data.subcategories || [];
        // Eski PHP: bazı klasörlerin altında kategoriler tablosunda satır yok; dosyalar bilgi.altkat ile bu id'ye bağlı.
        if (subs.length === 0) {
          const catName = categories.find((c) => c.id === categoryId)?.name || 'Dosyalar';
          subs = [
            {
              id: categoryId,
              name: catName,
              slug: '',
              description: '',
              categoryId,
            },
          ];
        }
        setSubcategories(subs);

        // Tek alt klasör ve yaprak ise ek tıklama beklemeden dosyalara geç (ör. ALCATEL REPAIR)
        if (subs.length === 1) {
          const only = subs[0];
          const hasChildren = await subcategoryHasChildren(only.id);
          if (!hasChildren) {
            openSubcategoryFiles(only.id);
          }
        }
      }
    } catch (error) {
      console.error('Alt kategori yükleme hatası:', error);
    } finally {
      setLoadingSubcategories(false);
    }
  };

  const handleBrandSelect = (brandId: string) => {
    setNavigatedFromSearch(false);
    setSearchReturnTerm('');
    clearFileSearch();
    setSelectedBrand(brandId);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setCategoryTrail([]);
  };

  const handleCategorySelect = (categoryId: string) => {
    setNavigatedFromSearch(false);
    setSearchReturnTerm('');
    clearFileSearch();
    const picked = categories.find((c) => c.id === categoryId);
    setCategoryTrail([
      {
        id: categoryId,
        name: picked?.name || 'Kategori',
      },
    ]);
    setSelectedCategory(categoryId);
    setSelectedSubcategory(null);
  };

  const handleSubcategorySelect = async (subcategoryId: string) => {
    // Önce dosya listesine geç; yavaş ağda tıklama "çalışmıyor" hissini önler
    openSubcategoryFiles(subcategoryId);

    try {
      const response = await fetch(`${apiFunctionsBase}/subcategories?categoryId=${subcategoryId}`);
      if (response.ok) {
        const data = await response.json();
        const children = data.subcategories || [];
        if (children.length > 0) {
          const picked = subcategories.find((s) => s.id === subcategoryId);
          setCategoryTrail((prev) => [
            ...prev,
            { id: subcategoryId, name: picked?.name || 'Alt Kategori' },
          ]);
          setSelectedCategory(subcategoryId);
          setSelectedSubcategory(null);
          setSubcategories(children);
          return;
        }
      }
    } catch (error) {
      console.error('Altin alti kategori kontrol hatasi:', error);
    }
  };

  const handleBackToBrands = () => {
    /** Arama klasöründen girildiyse: marka kategorileri ekranından çıkış = arama sonuçlarına dön */
    if (navigatedFromSearch && searchReturnTerm.trim()) {
      restoreSearchResultsView();
      return;
    }
    setNavigatedFromSearch(false);
    setSearchReturnTerm('');
    setSelectedBrand(null);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setCategories([]);
    setSubcategories([]);
    setCategoryTrail([]);
  };

  const restoreSearchResultsView = () => {
    const term = searchReturnTerm.trim();
    if (!term) return;
    setSelectedBrand(null);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setCategories([]);
    setSubcategories([]);
    setCategoryTrail([]);
    setNavigatedFromSearch(false);
    setDebouncedSearchTerm(searchReturnTerm);
    setSearchTerm(searchReturnTerm);
  };

  const handleBackToCategories = () => {
    /** Arama akışında da kategori / alt kategori trail'ini tek tek geri sar */
    if (categoryTrail.length > 1) {
      const newTrail = categoryTrail.slice(0, -1);
      const parent = newTrail[newTrail.length - 1];
      setCategoryTrail(newTrail);
      setSelectedCategory(parent.id);
      setSelectedSubcategory(null);
      loadSubcategories(parent.id);
      return;
    }
    setCategoryTrail([]);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSubcategories([]);
  };

  /** Dosya listesinden bir üst seviye: alt kategori listesine (arama akışında da aynı sıra). */
  const handleBackFromFiles = () => {
    setSelectedSubcategory(null);
  };


  const closeOverlayPages = () => {
    setShowProfilePage(false);
    setShowDownloadHistory(false);
    setShowLatestFilesPage(false);
    setShowFavoritesPage(false);
    setShowFileRequestPage(false);
    setShowInfoPages(false);
    setShowPackagePricing(false);
  };

  const openInfoPages = () => {
    closeOverlayPages();
    setShowInfoPages(true);
  };

  const openPackagePricing = () => {
    closeOverlayPages();
    setShowPackagePricing(true);
  };

  const openLatestFiles = () => {
    closeOverlayPages();
    setShowLatestFilesPage(true);
  };

  const openFavorites = () => {
    if (!isLoggedIn(user, accessToken)) {
      setAuthView('signin');
      setShowAuthModal(true);
      return;
    }
    closeOverlayPages();
    setShowFavoritesPage(true);
  };

  const openFileRequest = () => {
    if (!isLoggedIn(user, accessToken)) {
      setAuthView('signin');
      setShowAuthModal(true);
      return;
    }
    closeOverlayPages();
    setShowFileRequestPage(true);
  };

  /** Profil, bilgi, paketler, en yeniler vb. kapatır; marka/kategori ve aramayı sıfırlar */
  const goToHome = () => {
    closeOverlayPages();
    handleBackToBrands();
    setSearchTerm('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchSubmit = () => {
    const term = searchTerm.trim();
    setDebouncedSearchTerm(term ? searchTerm : '');
  };

  /** Misafir: profil yerine giriş modalı */
  const openProfileOrAuth = () => {
    if (isLoggedIn(user, accessToken)) {
      setShowProfilePage(true);
    } else {
      setAuthView('signin');
      setShowAuthModal(true);
    }
  };

  const hasActiveSearch = debouncedSearchTerm.trim().length > 0;

  useEffect(() => {
    const term = debouncedSearchTerm.trim();

    if (term) {
      applySeo({
        title: `"${term}" dosya araması — ${SEO_SITE_NAME}`,
        description: `ILSA Support'ta "${term}" ile teknik servis dosyaları ve çözümlerde arama.`,
      });
      return;
    }

    if (showProfilePage && isLoggedIn(user, accessToken)) {
      applySeo({
        title: `Profil — ${SEO_SITE_NAME}`,
        description: 'Kullanıcı profili ve hesap ayarları (oturum açıkken).',
        noindex: true,
      });
      return;
    }

    if (showPackagePricing) {
      applySeo({
        title: `Paketler ve fiyatlandırma — ${SEO_SITE_NAME}`,
        description: 'ILSA Support üyelik paketleri, indirme limitleri ve premium seçenekleri.',
      });
      return;
    }

    if (showLatestFilesPage) {
      applySeo({
        title: `En yeni teknik servis dosyaları — ${SEO_SITE_NAME}`,
        description: 'Platforma eklenen güncel servis dosyaları ve yazılımlar.',
      });
      return;
    }

    if (showFavoritesPage) {
      applySeo({
        title: `Favorilerim — ${SEO_SITE_NAME}`,
        description: 'Kaydettiğiniz favori teknik servis dosyaları.',
        noindex: true,
      });
      return;
    }

    if (showFileRequestPage) {
      applySeo({
        title: `Dosya iste — ${SEO_SITE_NAME}`,
        description: 'Sitede bulamadığınız dosyalar için istek gönderin.',
        noindex: true,
      });
      return;
    }

    if (showInfoPages) {
      applySeo({
        title: `Duyurular ve bilgi sayfaları — ${SEO_SITE_NAME}`,
        description: 'ILSA Support duyuruları, iletişim ve yardım içerikleri.',
      });
      return;
    }

    const brandName = selectedBrand
      ? String(brands.find((b) => b.id === selectedBrand)?.name ?? '').trim()
      : '';
    const catName = selectedCategory
      ? String(
          categoryTrail[categoryTrail.length - 1]?.name ||
            categories.find((c) => c.id === selectedCategory)?.name ||
            '',
        ).trim()
      : '';
    const subName = selectedSubcategory
      ? String(subcategories.find((s) => s.id === selectedSubcategory)?.name ?? '').trim()
      : '';

    if (selectedSubcategory && brandName) {
      applySeo({
        title: `${subName} — ${catName || 'Kategori'} — ${brandName} — ${SEO_SITE_NAME}`,
        description: `${brandName} / ${catName || 'kategori'} / ${subName}: servis dosyaları ve teknik bilgiler.`,
      });
      return;
    }

    if (selectedCategory && brandName) {
      applySeo({
        title: `${catName || 'Kategori'} — ${brandName} — ${SEO_SITE_NAME}`,
        description: `${brandName} markası için ${catName || 'kategori'} dosyaları ve çözümleri.`,
      });
      return;
    }

    if (selectedBrand && brandName) {
      applySeo({
        title: `${brandName} teknik servis dosyaları — ${SEO_SITE_NAME}`,
        description: `${brandName} markasına ait teknik servis dosyaları, yazılım ve destek içerikleri.`,
      });
      return;
    }

    applySeo({
      title: SEO_DEFAULT_TITLE,
      description: SEO_DEFAULT_DESCRIPTION,
    });
  }, [
    debouncedSearchTerm,
    showProfilePage,
    user,
    accessToken,
    showPackagePricing,
    showLatestFilesPage,
    showFavoritesPage,
    showFileRequestPage,
    showInfoPages,
    selectedBrand,
    selectedCategory,
    selectedSubcategory,
    brands,
    categories,
    subcategories,
    categoryTrail,
  ]);

  if (hasActiveSearch) {
    return (
      <div className="ilsa-page">
        <Header
          user={user}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={openProfileOrAuth}
          onShowDownloadHistory={() => setShowDownloadHistory(true)}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          autoFocusSearch
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => {
              setDebouncedSearchTerm('');
              setSearchTerm('');
              setSearchReturnTerm('');
              setNavigatedFromSearch(false);
            }}
            className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
          >
            <span>Geri Dön</span>
          </button>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Arama Sonuclari</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              "{debouncedSearchTerm}" icin tum dosyalar icinde arama yapiliyor.
            </p>
          </div>

          <FileList
            user={user}
            accessToken={accessToken}
            brandId={null}
            categoryId={null}
            subcategoryId={null}
            searchTerm={debouncedSearchTerm}
            onSearchChange={setSearchTerm}
            onNavigateFromSearch={(nav) => {
              if (!nav.brandId) return;
              const currentSearchTerm = debouncedSearchTerm.trim();
              if (currentSearchTerm) {
                setSearchReturnTerm(currentSearchTerm);
                setNavigatedFromSearch(true);
              }
              setSelectedBrand(nav.brandId);
              setSelectedCategory(nav.categoryId);
              setSelectedSubcategory(nav.subcategoryId);
              const pathFromSearch = Array.isArray((nav as any).path) ? (nav as any).path : [];
              const computedTrail = pathFromSearch.length > 0
                ? pathFromSearch
                    // path: [brand, ..., leaf]. Trail'de brand ve varsa seçili leaf tutulmaz.
                    .filter((p: any) => p?.id && String(p.id) !== String(nav.brandId))
                    .filter((p: any) => !nav.subcategoryId || String(p.id) !== String(nav.subcategoryId))
                    .map((p: any) => ({ id: String(p.id), name: String(p.name || '').trim() || 'Kategori' }))
                : (nav.categoryId ? [{ id: nav.categoryId, name: 'Kategori' }] : []);
              setCategoryTrail(computedTrail);
              setDebouncedSearchTerm('');
              setSearchTerm('');
            }}
            onShowPremium={openPremiumModal}
            onShowAuth={() => {
              setAuthView('signin');
              setShowAuthModal(true);
            }}
          />
        </div>

        {showAuthModal && (
          <AuthModal
            view={authView}
            onClose={() => setShowAuthModal(false)}
            onSignIn={onSignIn}
            onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          />
        )}

        {PREMIUM_UPSELL_ENABLED && showPremiumModal && isLoggedIn(user, accessToken) && (
          <PremiumModal user={user} accessToken={accessToken} onClose={() => setShowPremiumModal(false)} />
        )}

        {showDownloadHistory && isLoggedIn(user, accessToken) && (
          <DownloadHistory
            accessToken={accessToken}
            onClose={() => setShowDownloadHistory(false)}
          />
        )}

        <Footer />
      </div>
    );
  }

  // If profile page is shown, render only profile page
  if (showProfilePage && isLoggedIn(user, accessToken)) {
    return (
      <>
        <Header
          user={user}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={openProfileOrAuth}
          onShowDownloadHistory={() => setShowDownloadHistory(true)}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <ProfilePage
          user={user}
          accessToken={accessToken}
          onClose={() => setShowProfilePage(false)}
          onSignOut={onSignOut}
        />
        {showDownloadHistory && isLoggedIn(user, accessToken) && (
          <DownloadHistory
            accessToken={accessToken}
            onClose={() => setShowDownloadHistory(false)}
          />
        )}
      </>
    );
  }

  // Paket fiyatları & karşılaştırma (Halabtech tarzı tam sayfa)
  if (showPackagePricing) {
    return (
      <div className="ilsa-page">
        <Header
          user={user}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={() => {
            setShowPackagePricing(false);
            openProfileOrAuth();
          }}
          onShowDownloadHistory={() => {
            setShowPackagePricing(false);
            setShowDownloadHistory(true);
          }}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <PackagePricingPage onBack={() => setShowPackagePricing(false)} />
        <Footer />
        {showAuthModal && (
          <AuthModal
            view={authView}
            onClose={() => setShowAuthModal(false)}
            onSignIn={onSignIn}
            onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          />
        )}
        {PREMIUM_UPSELL_ENABLED && showPremiumModal && isLoggedIn(user, accessToken) && (
          <PremiumModal user={user} accessToken={accessToken} onClose={() => setShowPremiumModal(false)} />
        )}
        {showDownloadHistory && isLoggedIn(user, accessToken) && (
          <DownloadHistory
            accessToken={accessToken}
            onClose={() => setShowDownloadHistory(false)}
          />
        )}
      </div>
    );
  }

  if (showFavoritesPage && isLoggedIn(user, accessToken)) {
    return (
      <div className="ilsa-page">
        <FavoritesPage
          user={user}
          accessToken={accessToken}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onBack={() => setShowFavoritesPage(false)}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={openProfileOrAuth}
          onShowDownloadHistory={() => setShowDownloadHistory(true)}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
        />
        {showDownloadHistory && (
          <DownloadHistory accessToken={accessToken} onClose={() => setShowDownloadHistory(false)} />
        )}
        {showAuthModal && (
          <AuthModal
            view={authView}
            onClose={() => setShowAuthModal(false)}
            onSignIn={onSignIn}
            onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          />
        )}
        {PREMIUM_UPSELL_ENABLED && showPremiumModal && (
          <PremiumModal user={user} accessToken={accessToken} onClose={() => setShowPremiumModal(false)} />
        )}
      </div>
    );
  }

  if (showFileRequestPage && isLoggedIn(user, accessToken)) {
    return (
      <div className="ilsa-page">
        <FileRequestPage
          user={user}
          accessToken={accessToken}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onBack={() => setShowFileRequestPage(false)}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={openProfileOrAuth}
          onShowDownloadHistory={() => setShowDownloadHistory(true)}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
        />
        {showDownloadHistory && (
          <DownloadHistory accessToken={accessToken} onClose={() => setShowDownloadHistory(false)} />
        )}
        {showAuthModal && (
          <AuthModal
            view={authView}
            onClose={() => setShowAuthModal(false)}
            onSignIn={onSignIn}
            onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          />
        )}
        {PREMIUM_UPSELL_ENABLED && showPremiumModal && (
          <PremiumModal user={user} accessToken={accessToken} onClose={() => setShowPremiumModal(false)} />
        )}
      </div>
    );
  }

  // If latest files page is shown, render only latest files page
  if (showLatestFilesPage) {
    return (
      <>
        <Header
          user={user}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={openProfileOrAuth}
          onShowDownloadHistory={() => setShowDownloadHistory(true)}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <LatestFilesPage
          user={user}
          accessToken={accessToken}
          onBack={() => setShowLatestFilesPage(false)}
          onShowPremium={openPremiumModal}
          onShowAuth={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
        />
        {showDownloadHistory && isLoggedIn(user, accessToken) && (
          <DownloadHistory
            accessToken={accessToken}
            onClose={() => setShowDownloadHistory(false)}
          />
        )}
      </>
    );
  }

  if (showInfoPages) {
    return (
      <div className="ilsa-page">
        <Header
          user={user}
          onSignIn={() => {
            setAuthView('signin');
            setShowAuthModal(true);
          }}
          onSignUp={() => {
            setAuthView('signup');
            setShowAuthModal(true);
          }}
          onSignOut={onSignOut}
          onShowPremium={openPremiumModal}
          onShowProfile={() => {
            setShowInfoPages(false);
            openProfileOrAuth();
          }}
          onShowDownloadHistory={() => {
            setShowInfoPages(false);
            setShowPackagePricing(false);
            setShowDownloadHistory(true);
          }}
          onShowLatestFiles={openLatestFiles}
          onShowInfoPages={openInfoPages}
          onShowPackagePricing={openPackagePricing}
          onShowFavorites={openFavorites}
          onShowFileRequest={openFileRequest}
          onShowAdmin={onShowAdmin}
          onGoHome={goToHome}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
        <InfoPagesPublic onBack={() => setShowInfoPages(false)} />
        <Footer />
        {showAuthModal && (
          <AuthModal
            view={authView}
            onClose={() => setShowAuthModal(false)}
            onSignIn={onSignIn}
            onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
          />
        )}
        {PREMIUM_UPSELL_ENABLED && showPremiumModal && isLoggedIn(user, accessToken) && (
          <PremiumModal user={user} accessToken={accessToken} onClose={() => setShowPremiumModal(false)} />
        )}
        {showDownloadHistory && isLoggedIn(user, accessToken) && (
          <DownloadHistory
            accessToken={accessToken}
            onClose={() => setShowDownloadHistory(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="ilsa-modern-page">
      <div className="ilsa-modern-shell">
        <div className="ilsa-modern-frame">
        <header className="ilsa-modern-navbar">
          <button type="button" className="ilsa-modern-logo ilsa-modern-logo-btn" onClick={goToHome} aria-label="Anasayfa">
            <img src={SITE_LOGO_SRC} alt="ILSA Support" className="ilsa-modern-logo-mark" width={360} height={72} decoding="async" />
          </button>

          <nav className="ilsa-modern-menu">
            <button type="button" onClick={goToHome}>ANASAYFA</button>
            <button type="button" onClick={() => { setSearchTerm(''); openLatestFiles(); }}>EN YENİLER</button>
            <button type="button" onClick={openPackagePricing}>FİYATLAR</button>
            <button type="button" onClick={openFavorites}>FAVORİLERİM</button>
            <button type="button" onClick={openFileRequest}>DOSYA İSTE</button>
            <button type="button" onClick={() => window.open('https://drive.google.com/file/d/1lLusXCrso2kdWPme1VOfuhhsV15ggLE7/view', '_blank', 'noopener,noreferrer')}>VİRÜS TOOL</button>
            <button type="button" onClick={() => window.open(CONTACT_MESSENGER_URL, '_blank', 'noopener,noreferrer')}>İLETİŞİM</button>
          </nav>

          <div className="ilsa-modern-nav-actions">
            {isLoggedIn(user, accessToken) && (
              <button
                type="button"
                className="ilsa-modern-icon-btn"
                onClick={() => setShowDownloadHistory(true)}
                title="Geçmiş İndirmeler"
                aria-label="Geçmiş İndirmeler"
              >
                <Download size={16} />
              </button>
            )}
            {isLoggedIn(user, accessToken) ? (
              <>
                <button type="button" className="ilsa-modern-icon-btn" onClick={openProfileOrAuth} aria-label="Profil">
                  👤
                </button>
                <button type="button" className="ilsa-modern-profile-btn" onClick={openProfileOrAuth}>
                  <span className="ilsa-profile-name-row">
                    <span>{user.name || user.username || 'Kullanici'}</span>
                    <MembershipBadge user={user} accessToken={accessToken} />
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="ilsa-modern-profile-btn"
                  onClick={() => {
                    setAuthView('signin');
                    setShowAuthModal(true);
                  }}
                >
                  GİRİŞ
                </button>
                <button
                  type="button"
                  className="ilsa-modern-admin-btn"
                  onClick={() => {
                    setAuthView('signup');
                    setShowAuthModal(true);
                  }}
                >
                  KAYIT
                </button>
              </>
            )}
            <button
              type="button"
              className="ilsa-modern-icon-btn ilsa-modern-theme-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Acik moda gec' : 'Koyu moda gec'}
              aria-label={theme === 'dark' ? 'Acik moda gec' : 'Koyu moda gec'}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />}
            </button>
            {onShowAdmin && isAdminUser(user) && (
              <button type="button" className="ilsa-modern-admin-btn" onClick={onShowAdmin}>YÖNETİM PANELİ</button>
            )}
            {isLoggedIn(user, accessToken) && (
              <button type="button" className="ilsa-modern-logout-btn" onClick={onSignOut}>
                ÇIKIŞ YAP
              </button>
            )}
          </div>
        </header>

        <ModernHomeHero />

        {!selectedBrand && !debouncedSearchTerm && (
          <section className="ilsa-modern-brands-section">
            <div className="ilsa-modern-section-header">
              <div>
                <h2>Markalar</h2>
              </div>
              <div className="ilsa-modern-header-search-wrap">
                <label className="ilsa-modern-header-search">
                  <span>🔎</span>
                  <input
                    placeholder="DOSYA ARA"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearchSubmit();
                    }}
                  />
                </label>
                <button type="button" className="ilsa-modern-header-search-btn" onClick={handleSearchSubmit}>
                  ARA
                </button>
              </div>
            </div>
            <div className="ilsa-modern-brand-grid">
              {brands.map((brand) => {
                const iconSrc = resolveBrandIconForGrid(brand.name, brand.icon, brandMarkaPaths);
                return (
                  <button type="button" className="ilsa-modern-brand-card" key={brand.id} onClick={() => handleBrandSelect(brand.id)}>
                    {iconSrc ? (
                      <img src={iconSrc} alt={brand.name} className="ilsa-modern-brand-logo-img" />
                    ) : (
                      <div className="ilsa-modern-brand-logo">{String(brand.name || '?').slice(0, 2).toUpperCase()}</div>
                    )}
                    <h3>{brand.name}</h3>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        </div>

        <div className="ilsa-modern-main-content">
        {/* 🍞 Modern Breadcrumb Navigation */}
        {(selectedBrand || selectedCategory || selectedSubcategory) && (
          <ModernBreadcrumb
            items={[
              {
                label: 'Markalar',
                onClick: handleBackToBrands,
              },
              ...(selectedBrand ? [{
                label: brands.find(b => b.id === selectedBrand)?.name || 'Marka',
                onClick: selectedCategory
                  ? () => {
                      setSelectedCategory(null);
                      setSelectedSubcategory(null);
                    }
                  : undefined,
                active: !selectedCategory,
              }] : []),
              ...(selectedCategory ? [{
                label: categoryTrail[categoryTrail.length - 1]?.name || categories.find(c => c.id === selectedCategory)?.name || 'Kategori',
                onClick: selectedSubcategory ? () => {
                  setSelectedSubcategory(null);
                } : undefined,
                active: !selectedSubcategory,
              }] : []),
              ...(selectedSubcategory ? [{
                label: subcategories.find(s => s.id === selectedSubcategory)?.name || 'Alt Kategori',
                active: true,
              }] : []),
            ]}
          />
        )}
        
        {/* Category Grid */}
        {selectedBrand && !selectedCategory && (
          loadingCategories ? (
            <div>
              <button
                type="button"
                onClick={handleBackToBrands}
                className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                <span>Geri Dön</span>
              </button>
              <div className="text-center py-16">
                <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Kategoriler yükleniyor...</p>
              </div>
            </div>
          ) : (
            <CategoryGrid
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategorySelect}
              brandName={brands.find(b => b.id === selectedBrand)?.name || ''}
              onBack={handleBackToBrands}
            />
          )
        )}

        {/* Subcategory Grid */}
        {selectedBrand && selectedCategory && !selectedSubcategory && (
          loadingSubcategories ? (
            <div>
              <button
                type="button"
                onClick={handleBackToCategories}
                className="mb-6 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                <span>Geri Dön</span>
              </button>
              <div className="text-center py-16">
                <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Alt kategoriler yükleniyor...</p>
              </div>
            </div>
          ) : (
            <SubcategoryGrid
              subcategories={subcategories}
              selectedSubcategory={selectedSubcategory}
              onSelectSubcategory={handleSubcategorySelect}
              categoryName={categoryTrail[categoryTrail.length - 1]?.name || categories.find(c => c.id === selectedCategory)?.name || ''}
              brandName={brands.find(b => b.id === selectedBrand)?.name || ''}
              onBack={handleBackToCategories}
            />
          )
        )}

        {/* File List */}
        {(selectedBrand && selectedCategory && selectedSubcategory) || debouncedSearchTerm ? (
          <FileList
            user={user}
            accessToken={accessToken}
            brandId={selectedBrand}
            categoryId={selectedCategory}
            subcategoryId={selectedSubcategory}
            searchTerm={debouncedSearchTerm}
            onSearchChange={setSearchTerm}
            onNavigateFromSearch={(nav) => {
              if (!nav.brandId) return;
              const currentSearchTerm = debouncedSearchTerm.trim();
              if (currentSearchTerm) {
                setSearchReturnTerm(currentSearchTerm);
                setNavigatedFromSearch(true);
              }
              setSelectedBrand(nav.brandId);
              setSelectedCategory(nav.categoryId);
              setSelectedSubcategory(nav.subcategoryId);
              const pathFromSearch = Array.isArray((nav as any).path) ? (nav as any).path : [];
              const computedTrail = pathFromSearch.length > 0
                ? pathFromSearch
                    // path: [brand, ..., leaf]. Trail'de brand ve varsa seçili leaf tutulmaz.
                    .filter((p: any) => p?.id && String(p.id) !== String(nav.brandId))
                    .filter((p: any) => !nav.subcategoryId || String(p.id) !== String(nav.subcategoryId))
                    .map((p: any) => ({ id: String(p.id), name: String(p.name || '').trim() || 'Kategori' }))
                : (nav.categoryId ? [{ id: nav.categoryId, name: 'Kategori' }] : []);
              setCategoryTrail(computedTrail);
              setDebouncedSearchTerm('');
              setSearchTerm('');
            }}
            onBack={selectedSubcategory ? handleBackFromFiles : undefined}
            onShowPremium={openPremiumModal}
            onShowAuth={() => {
              setAuthView('signin');
              setShowAuthModal(true);
            }}
          />
        ) : null}
      </div>
      </div>

      {/* Modals */}
      {showAuthModal && (
        <AuthModal
          view={authView}
          onClose={() => setShowAuthModal(false)}
          onSignIn={onSignIn}
          onSwitchView={() => setAuthView(authView === 'signin' ? 'signup' : 'signin')}
        />
      )}

      {PREMIUM_UPSELL_ENABLED && showPremiumModal && isLoggedIn(user, accessToken) && (
        <PremiumModal
          user={user}
          accessToken={accessToken}
          onClose={() => setShowPremiumModal(false)}
        />
      )}

      {PREMIUM_UPSELL_ENABLED && showPremiumModal && !isLoggedIn(user, accessToken) && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-white mb-4">Giriş gerekli</h2>
            <p className="text-gray-400 mb-6">
              Premium üyelik için önce hesabınıza giriş yapın.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPremiumModal(false);
                  setAuthView('signin');
                  setShowAuthModal(true);
                }}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
              >
                Giriş yap
              </button>
              <button
                onClick={() => setShowPremiumModal(false)}
                className="flex-1 bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Page */}
      {showProfilePage && isLoggedIn(user, accessToken) && (
        <ProfilePage
          user={user}
          accessToken={accessToken}
          onClose={() => setShowProfilePage(false)}
          onSignOut={onSignOut}
        />
      )}

      {/* Download History */}
      {showDownloadHistory && isLoggedIn(user, accessToken) && (
        <DownloadHistory
          accessToken={accessToken}
          onClose={() => setShowDownloadHistory(false)}
        />
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
}