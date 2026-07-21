import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../utils/supabase/info';
import { mergePricingPagePayload, type PricingPagePayload } from '../data/pricingPageDefaults';
import { CONTACT_MESSENGER_URL } from '../constants/contactLinks';
import '../styles/modern-pages.css';

interface PackagePricingPageProps {
  onBack: () => void;
}

export function PackagePricingPage({ onBack }: PackagePricingPageProps) {
  const [data, setData] = useState<PricingPagePayload>(() => mergePricingPagePayload(null));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiFunctionsBase}/cms/pricing-page`);
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && j?.payload != null) {
          try {
            setData(mergePricingPagePayload(j.payload));
          } catch (mergeErr) {
            console.error('[pricing-page] payload', mergeErr);
            if (!cancelled) setLoadError('Paket verisi okunamadı; varsayılanlar gösteriliyor.');
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError('Canlı paket listesi yüklenemedi; varsayılanlar gösteriliyor.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** CMS’deki plans dizisi sırası (admin’de yukarı/aşağı) — süreye göre otomatik sıralama yok */
  const visiblePlans = data.plans.filter((p) => p.id !== 'free');

  const openContactMessenger = () => {
    window.open(CONTACT_MESSENGER_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="ilsa-page text-zinc-900 dark:text-zinc-100">
      <div className="border-b border-zinc-800 bg-[#0b1525]/90 backdrop-blur sticky top-[57px] z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-400 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Ana sayfaya dön
          </button>
        </div>
      </div>

      <div className="ilsa-page-container max-w-[1400px] py-6 sm:py-10">
        {loadError && (
          <p className="text-center text-sm text-amber-700 dark:text-amber-400 mb-4">{loadError}</p>
        )}

        <div className="flex flex-wrap justify-center items-start gap-6 sm:gap-8 md:gap-10">
          {visiblePlans
            .filter((p) => {
              const t = String(p.imageUrl || '').trim();
              return t.length > 0 && resolveCmsPublicAssetUrl(t).length > 0;
            })
            .map((plan) => {
              const src = resolveCmsPublicAssetUrl(String(plan.imageUrl).trim());
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={openContactMessenger}
                  className={`group relative shrink-0 w-[min(100%,400px)] aspect-square rounded-2xl overflow-hidden border bg-zinc-950/30 p-0 shadow-lg transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1525] ${
                    plan.highlighted
                      ? 'border-red-500/80 ring-2 ring-red-500/25'
                      : 'border-zinc-700'
                  }`}
                  aria-label={
                    plan.name
                      ? `${plan.name} — İletişim (Messenger) yeni sekmede`
                      : 'İletişim — Messenger yeni sekmede'
                  }
                >
                  <img
                    src={src}
                    alt={plan.name || 'Paket görseli'}
                    className="block h-full w-full object-contain align-middle"
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            })}
        </div>

        {visiblePlans.every((p) => !String(p.imageUrl || '').trim()) && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 py-16 max-w-md mx-auto">
            Tanımlı paket görseli yok. Yönetim panelinden paket görselleri (imageUrl) ekleyin.
          </p>
        )}
      </div>
    </div>
  );
}
