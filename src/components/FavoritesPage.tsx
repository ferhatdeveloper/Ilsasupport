import { useEffect, useState } from 'react';
import { Star, ArrowLeft, Download, Lock } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { buildOptionalAuthHeaders } from '../utils/secureApi';
import { canDownloadFiles } from '../utils/membership';
import { useFavorites } from '../hooks/useFavorites';
import { FavoriteStarButton } from './FavoriteStarButton';
import { Header } from './Header';
import { Footer } from './Footer';
import '../styles/modern-pages.css';

type FavoriteRow = {
  fileId: string;
  fileName: string | null;
  meta?: { brandName?: string; categoryName?: string };
  createdAt: string;
};

interface FavoritesPageProps {
  user: any;
  accessToken: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onBack: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onShowPremium: () => void;
  onShowProfile?: () => void;
  onShowDownloadHistory?: () => void;
  onShowLatestFiles?: () => void;
  onShowInfoPages?: () => void;
  onShowPackagePricing?: () => void;
  onShowFavorites?: () => void;
  onShowFileRequest?: () => void;
  onGoHome?: () => void;
  onShowAdmin?: () => void;
}

export function FavoritesPage({
  user,
  accessToken,
  searchTerm,
  onSearchChange,
  onBack,
  onSignIn,
  onSignUp,
  onSignOut,
  onShowPremium,
  onShowProfile,
  onShowDownloadHistory,
  onShowLatestFiles,
  onShowInfoPages,
  onShowPackagePricing,
  onShowFavorites,
  onShowFileRequest,
  onGoHome,
  onShowAdmin,
}: FavoritesPageProps) {
  const [items, setItems] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const premium = canDownloadFiles(user, accessToken);
  const { toggleFavorite, load: reloadFavoriteIds } = useFavorites(accessToken);

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiFunctionsBase}/favorites`, {
        headers: buildOptionalAuthHeaders(accessToken),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.favorites || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, [accessToken]);

  const removeFavorite = async (fileId: string) => {
    const r = await toggleFavorite(fileId);
    if (r.ok && !r.favorited) {
      setItems((prev) => prev.filter((x) => x.fileId !== fileId));
      void reloadFavoriteIds();
    }
  };

  return (
    <div className="ilsa-page">
      <Header
        user={user}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onSignOut={onSignOut}
        onShowPremium={onShowPremium}
        onShowProfile={onShowProfile}
        onShowDownloadHistory={onShowDownloadHistory}
        onShowLatestFiles={onShowLatestFiles}
        onShowInfoPages={onShowInfoPages}
        onShowPackagePricing={onShowPackagePricing}
        onShowFavorites={onShowFavorites}
        onShowFileRequest={onShowFileRequest}
        onShowAdmin={onShowAdmin}
        onGoHome={onGoHome}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
      />

      <main className="ilsa-modern-shell py-8 px-4 max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Geri
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <Star className="w-7 h-7 fill-yellow-400 stroke-yellow-500 text-yellow-400" />
          Favorilerim
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Dosya listesindeki yıldıza tıklayarak favorilere eklediğiniz kayıtlar burada görünür.
        </p>

        {loading ? (
          <p className="text-gray-500">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <div className="ilsa-surface p-8 text-center text-gray-500">
            Henüz favori dosyanız yok. Dosyaların yanındaki yıldıza tıklayın.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.fileId}
                className="ilsa-surface p-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-yellow-400 bg-gradient-to-r from-yellow-50/80 to-transparent dark:from-yellow-900/25 dark:to-transparent"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Star className="w-6 h-6 shrink-0 fill-yellow-400 stroke-yellow-500 text-yellow-400 mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white truncate">
                        {item.fileName || `Dosya #${item.fileId}`}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-yellow-400/25 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:text-yellow-200 ring-1 ring-yellow-400/50">
                        Favori
                      </span>
                    </div>
                    {item.meta?.brandName && (
                      <p className="text-sm text-gray-500 mt-1">
                        {item.meta.brandName}
                        {item.meta.categoryName ? ` · ${item.meta.categoryName}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(item.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FavoriteStarButton
                    active
                    size="sm"
                    onToggle={() => void removeFavorite(item.fileId)}
                  />
                  <span
                    className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${
                      premium ? 'download-action-btn' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {premium ? (
                      <>
                        <Download className="w-4 h-4" />
                        İndir
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        İNDİRME
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
