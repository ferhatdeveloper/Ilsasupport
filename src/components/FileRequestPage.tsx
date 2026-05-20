import { useEffect, useState } from 'react';
import { FileQuestion, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../utils/supabase/info';
import { buildOptionalAuthHeaders } from '../utils/secureApi';
import { Header } from './Header';
import { Footer } from './Footer';
import '../styles/modern-pages.css';

interface FileRequestPageProps {
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

export function FileRequestPage({
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
}: FileRequestPageProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brandHint, setBrandHint] = useState('');
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<
    Array<{ id: string; title: string; status: string; created_at: string }>
  >([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${apiFunctionsBase}/file-requests/mine`, {
        headers: buildOptionalAuthHeaders(accessToken),
      });
      if (res.ok) {
        const data = await res.json();
        setMine(data.requests || []);
      }
    })();
  }, [accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`${apiFunctionsBase}/file-requests`, {
        method: 'POST',
        headers: {
          ...buildOptionalAuthHeaders(accessToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, description, brandHint }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gönderilemedi');
        return;
      }
      toast.success('Dosya isteğiniz alındı. İncelendikten sonra size dönüş yapılacaktır.');
      setTitle('');
      setDescription('');
      setBrandHint('');
      const list = await fetch(`${apiFunctionsBase}/file-requests/mine`, {
        headers: buildOptionalAuthHeaders(accessToken),
      });
      if (list.ok) {
        const j = await list.json();
        setMine(j.requests || []);
      }
    } catch {
      toast.error('Bağlantı hatası');
    } finally {
      setSending(false);
    }
  };

  const statusLabel: Record<string, string> = {
    pending: 'Beklemede',
    reviewing: 'İnceleniyor',
    done: 'Tamamlandı',
    rejected: 'Reddedildi',
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

      <main className="ilsa-modern-shell py-8 px-4 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Geri
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <FileQuestion className="w-7 h-7 text-purple-500" />
          Dosya İste
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Aradığınız dosya sitede yoksa buradan istek gönderin. Ekibimiz değerlendirecektir.
        </p>

        <form onSubmit={handleSubmit} className="ilsa-surface p-6 space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dosya / konu başlığı *
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Örn: Samsung A54 FRP dosyası"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Marka / model (isteğe bağlı)
            </label>
            <input
              type="text"
              value={brandHint}
              onChange={(e) => setBrandHint(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Samsung, Xiaomi…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Açıklama *
            </label>
            <textarea
              required
              minLength={10}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="Hangi dosyaya ihtiyacınız var, sürüm, link varsa ekleyin…"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Gönderiliyor…' : 'İsteği gönder'}
          </button>
        </form>

        {mine.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Önceki istekleriniz
            </h2>
            <ul className="space-y-2">
              {mine.map((r) => (
                <li key={r.id} className="ilsa-surface p-3 text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{r.title}</div>
                  <span className="text-xs text-gray-500">
                    {statusLabel[r.status] || r.status} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('tr-TR')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
