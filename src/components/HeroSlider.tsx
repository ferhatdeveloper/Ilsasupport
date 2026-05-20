import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../utils/supabase/info';
import { readResponseJson } from '../utils/readResponseJson';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  image: string;
  gradient: string;
}

const defaultSlides: Slide[] = [
  {
    id: 'default-1',
    title: '🔥 70+ Marka',
    subtitle: 'ILSA Support Platform',
    description: 'Samsung, Xiaomi, Huawei, iPhone ve 70+ marka için firmware, tool ve driver indirin',
    buttonText: 'Dosyaları Keşfet',
    buttonUrl: '#',
    image: 'https://images.unsplash.com/photo-1588515603140-81bd9f7d1db0?w=1200',
    gradient: 'from-blue-900 via-purple-900 to-pink-900',
  },
  {
    id: 'default-2',
    title: '⚡ 1000+ Dosya',
    subtitle: 'Güncel Firmware & Tools',
    description: 'En son firmware, tool ve driver dosyalarına anında erişim sağlayın',
    buttonText: 'Hemen İncele',
    buttonUrl: '#',
    image: 'https://images.unsplash.com/photo-1622532349398-3d9b2b8598c3?w=1200',
    gradient: 'from-purple-900 via-pink-900 to-red-900',
  },
  {
    id: 'default-3',
    title: '🚀 Premium Destek',
    subtitle: 'Hızlı & Güvenli İndirme',
    description: 'Premium üyelik ile sınırsız indirme ve öncelikli destek',
    buttonText: 'Premium Ol',
    buttonUrl: '#',
    image: 'https://images.unsplash.com/photo-1758686254030-a6dae2f49e69?w=1200',
    gradient: 'from-indigo-900 via-purple-900 to-pink-900',
  },
  {
    id: 'default-4',
    title: '📱 50K+ İndirme',
    subtitle: "Türkiye'nin SUPPORT Platformu",
    description: 'Binlerce kullanıcının tercih ettiği güvenilir platform',
    buttonText: 'Başla',
    buttonUrl: '#',
    image: 'https://images.unsplash.com/photo-1762330916855-117daacbf851?w=1200',
    gradient: 'from-pink-900 via-purple-900 to-blue-900',
  },
];

export function HeroSlider() {
  const [slides, setSlides] = useState<Slide[]>(defaultSlides);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiFunctionsBase}/cms/hero-slides`);
        if (!res.ok || cancelled) return;
        const data = await readResponseJson<{ slides?: unknown[] }>(res);
        const remote = (data.slides || []) as any[];
        if (!remote.length) return;
        const mapped: Slide[] = remote.map((s) => ({
          id: String(s.id),
          title: s.title || '',
          subtitle: s.subtitle || '',
          description: s.description || '',
          buttonText: s.buttonText || '',
          buttonUrl: s.buttonUrl || '#',
          image: resolveCmsPublicAssetUrl(String(s.imageUrl || '')),
          gradient: s.gradient || 'from-blue-900 via-purple-900 to-pink-900',
        }));
        if (!cancelled) {
          setSlides(mapped);
          setCurrentSlide(0);
        }
      } catch {
        /* varsayılan slaytlar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, slides.length]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const goToPrevious = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const goToNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const onCtaClick = () => {
    const url = slides[currentSlide]?.buttonUrl?.trim() || '#';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const el = document.querySelector('[data-brand-grid], [data-file-list]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const s = slides[currentSlide];
  if (!s) return null;

  return (
    <div className="w-full mb-0">
      <div className="w-full flex items-stretch">
        {/* Sol alan: logo için ayrılmış bölüm */}
        <div
          className="hidden md:flex h-60 items-center justify-center bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
          style={{ width: '400px', minWidth: '400px', flex: '0 0 400px' }}
        >
          <img
            src="/img/LOGO.png"
            alt="ILSA Support Logo"
            className="w-auto h-auto max-w-[250px] object-contain"
          />
        </div>

        {/* Orta alan: slider */}
        <div className="relative h-60 overflow-hidden group w-full md:flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                className="absolute inset-0"
              >
                <div
                  className="w-full h-60 bg-cover bg-center"
                  style={{ backgroundImage: `url(${s.image})` }}
                >
                  <div className="w-full h-60 bg-gradient-to-r from-black/80 via-black/50 to-transparent flex items-center">
                    <div className="w-full px-4 sm:px-6">
                      <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="max-w-2xl"
                      >
                        {s.subtitle ? (
                          <p className="text-sm text-purple-200 mb-1 font-medium tracking-wide">{s.subtitle}</p>
                        ) : null}
                        <h2 className="text-4xl md:text-5xl mb-4 text-white font-extrabold">{s.title}</h2>
                        <p className="text-base md:text-lg text-gray-200 mb-6 leading-relaxed whitespace-pre-line">
                          {s.description}
                        </p>
                        <button
                          type="button"
                          onClick={onCtaClick}
                          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105 shadow-lg"
                        >
                          {s.buttonText}
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <button
              type="button"
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full border border-white/30 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 z-10 hover:scale-110"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <button
              type="button"
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full border border-white/30 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 z-10 hover:scale-110"
              aria-label="Next slide"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {slides.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => goToSlide(index)}
                  className={`transition-all duration-300 ${
                    index === currentSlide ? 'w-10 bg-white shadow-lg' : 'w-2.5 bg-white/40 hover:bg-white/70 hover:w-4'
                  } h-2.5 rounded-full`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
        </div>

        {/* Sağ alan: logo için ayrılmış bölüm */}
        <div
          className="hidden md:flex h-60 items-center justify-center bg-gray-100 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800"
          style={{ width: '400px', minWidth: '400px', flex: '0 0 400px' }}
        >
          <img
            src="/img/LOGO.png"
            alt="ILSA Support Logo"
            className="w-auto h-auto max-w-[250px] object-contain"
          />
        </div>
      </div>
    </div>
  );
}
