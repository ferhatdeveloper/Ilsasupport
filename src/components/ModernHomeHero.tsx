import { useState, useEffect, useCallback } from 'react';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../utils/supabase/info';
import { readResponseJson } from '../utils/readResponseJson';

const DEFAULT_BG =
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1600&auto=format&fit=crop';

type SlideRow = {
  id: string;
  imageUrl?: string;
};

function cssUrl(u: string): string {
  const s = u.replace(/\\/g, '/').replace(/"/g, '\\"');
  return `url("${s}")`;
}

export function ModernHomeHero() {
  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiFunctionsBase}/cms/hero-slides`);
        if (!res.ok || cancelled) return;
        const data = await readResponseJson<{ slides?: SlideRow[] }>(res);
        const list = (data.slides || []).filter((s) => s && String(s.id || '').length);
        if (!cancelled) {
          setSlides(list);
          setIndex(0);
        }
      } catch {
        /* varsayılan görsel */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [slides.length, paused]);

  useEffect(() => {
    setIndex((prev) => (slides.length ? Math.min(prev, slides.length - 1) : 0));
  }, [slides.length]);

  const goDot = useCallback((i: number) => {
    setIndex(i);
    setPaused(true);
    window.setTimeout(() => setPaused(false), 12000);
  }, []);

  const safeIndex = slides.length > 0 ? Math.min(index, slides.length - 1) : 0;
  const active = slides[safeIndex];
  const useRemote = slides.length > 0 && !!active;

  const bgUrl = useRemote
    ? resolveCmsPublicAssetUrl(String(active.imageUrl || '').trim()) || DEFAULT_BG
    : DEFAULT_BG;

  return (
    <section
      className="ilsa-modern-hero ilsa-modern-hero--bare"
      style={{
        backgroundImage: cssUrl(bgUrl),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="ilsa-modern-overlay ilsa-modern-hero-overlay--bare">
        {useRemote ? (
          <div className="ilsa-modern-hero-dots">
            {slides.map((_, i) => (
              <button
                key={slides[i]?.id ?? i}
                type="button"
                className={`ilsa-modern-dot${i === safeIndex ? ' ilsa-modern-active-dot' : ''}`}
                onClick={() => goDot(i)}
                aria-label={`Slayt ${i + 1}`}
                style={{ cursor: 'pointer', border: 'none', padding: 0 }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
