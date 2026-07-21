import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Image as ImageIcon, FileText, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { uploadCmsImage } from './cmsImageUpload';
import { ImageUploadField } from './ImageUploadField';
import { useTheme } from '../../contexts/ThemeContext';

type HeroSlide = {
  id: string;
  sortOrder: number;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  imageUrl: string;
  gradient: string;
  isActive: boolean;
  createdAt?: string;
  isSquareImage?: boolean;
};

const SQUARE_SLIDE_GRADIENT = 'square-image';

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function slideFromApi(s: Partial<HeroSlide> & { id: string }): HeroSlide {
  const gradient = s.gradient ?? 'from-blue-900 via-purple-900 to-pink-900';
  return {
    id: String(s.id),
    sortOrder: Number(s.sortOrder) || 0,
    title: s.title ?? '',
    subtitle: s.subtitle ?? '',
    description: s.description ?? '',
    buttonText: s.buttonText ?? '',
    buttonUrl: s.buttonUrl ?? '',
    imageUrl: s.imageUrl ?? '',
    gradient,
    isActive: s.isActive !== false,
    createdAt: s.createdAt ? String(s.createdAt) : undefined,
    isSquareImage: gradient === SQUARE_SLIDE_GRADIENT,
  };
}

type InfoPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt?: string;
};

const emptySlide = (): Omit<HeroSlide, 'id'> => ({
  sortOrder: 0,
  title: '',
  subtitle: '',
  description: '',
  buttonText: '',
  buttonUrl: 'https://',
  imageUrl: '',
  gradient: 'from-blue-900 via-purple-900 to-pink-900',
  isActive: true,
});

export function AdminContentPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [section, setSection] = useState<'slides' | 'info'>('slides');
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [slideLoading, setSlideLoading] = useState(true);
  const [slideError, setSlideError] = useState('');
  const [slideMsg, setSlideMsg] = useState('');
  const [slideOpError, setSlideOpError] = useState('');
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [savingSlideId, setSavingSlideId] = useState<string | null>(null);

  const [infoPages, setInfoPages] = useState<InfoPage[]>([]);
  const [infoPage, setInfoPage] = useState(1);
  const [infoTotalPages, setInfoTotalPages] = useState(1);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const pageClass = isDark ? 'p-8 max-w-5xl text-slate-100' : 'p-8 max-w-5xl text-slate-900';
  const mutedClass = isDark ? 'text-gray-400' : 'text-slate-600';
  const cardClass = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-3'
    : 'bg-white border border-slate-200 rounded-xl p-6 space-y-3 shadow-sm';
  const inputClass = isDark
    ? 'mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white'
    : 'mt-1 w-full bg-white border border-slate-200 rounded px-3 py-2 text-slate-900';
  const tabActive = 'bg-purple-600 text-white';
  const tabIdle = isDark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-700';
  const okMsgClass = isDark
    ? 'text-sm text-green-300 bg-green-900/20 border border-green-800 rounded p-3'
    : 'text-sm text-green-900 bg-green-50 border border-green-200 rounded p-3';
  const errMsgClass = isDark
    ? 'text-sm text-red-300 bg-red-900/30 border border-red-800 rounded p-3'
    : 'text-sm text-red-900 bg-red-50 border border-red-200 rounded p-3';
  const jsonHeaders = { 'Content-Type': 'application/json' };

  const parseJsonOrThrow = (raw: string, fallback = 'Geçersiz sunucu yanıtı') => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${fallback}: ${raw.slice(0, 140)}`);
    }
  };

  const loadSlides = useCallback(async () => {
    setSlideLoading(true);
    setSlideError('');
    setSlideOpError('');
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/cms/hero-slides`);
      const data = parseJsonOrThrow(await res.text(), 'Slayt yanıtı JSON değil');
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || 'Yükleme hatası');
      setSlides(
        (data.slides || []).map((s: Partial<HeroSlide> & { id: string }) => slideFromApi(s)),
      );
    } catch (e: unknown) {
      setSlideError(e instanceof Error ? e.message : String(e));
      setSlides([]);
    } finally {
      setSlideLoading(false);
    }
  }, []);

  const loadInfo = useCallback(async () => {
    setInfoLoading(true);
    setInfoError('');
    setInfoMsg('');
    try {
      const res = await adminFetch(
        `${apiFunctionsBase}/admin/cms/info-pages?page=${infoPage}&limit=10`,
      );
      const data = parseJsonOrThrow(await res.text(), 'Bilgi sayfaları yanıtı JSON değil');
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || 'Yükleme hatası');
      setInfoPages(data.pages || []);
      setInfoTotalPages(data.totalPages || 1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setInfoError(msg);
      setInfoPages([]);
    } finally {
      setInfoLoading(false);
    }
  }, [infoPage]);

  useEffect(() => {
    void loadSlides();
    void loadInfo();
  }, [loadSlides, loadInfo]);

  useEffect(() => {
    if (section === 'info') void loadInfo();
  }, [section, infoPage, loadInfo]);

  const saveSlide = async (s: HeroSlide) => {
    setSlideMsg('');
    setSlideOpError('');
    setSavingSlideId(s.id);
    try {
      const body = {
        sortOrder: s.sortOrder,
        title: s.title,
        subtitle: s.subtitle,
        description: s.description,
        buttonText: s.buttonText,
        buttonUrl: s.buttonUrl,
        imageUrl: s.imageUrl,
        gradient: s.isSquareImage ? SQUARE_SLIDE_GRADIENT : s.gradient,
        isActive: s.isActive,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
      };
      const isNew = s.id.startsWith('new-');
      const url = isNew
        ? `${apiFunctionsBase}/admin/cms/hero-slides`
        : `${apiFunctionsBase}/admin/cms/hero-slides/${s.id}`;
      const res = await adminFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const data = parseJsonOrThrow(await res.text(), 'Kayıt yanıtı JSON değil');
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || 'Kayıt hatası');
      await loadSlides();
      setSlideMsg('Kaydedildi.');
    } catch (e: unknown) {
      setSlideOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSlideId(null);
    }
  };

  const uploadSlideImage = async (slideId: string, file: File) => {
    setSlideMsg('');
    setSlideOpError('');
    setUploadingSlideId(slideId);
    try {
      const slide = slides.find((x) => x.id === slideId);
      if (!slide) throw new Error('Slayt bulunamadı');

      const imageUrl = await uploadCmsImage(file, slide.isSquareImage ? 'category' : 'slide');

      const updated: HeroSlide = { ...slide, imageUrl };
      updateSlideLocal(slideId, { imageUrl });
      await saveSlide(updated);
      setSlideMsg('Görsel yüklendi ve kaydedildi.');
    } catch (e: unknown) {
      setSlideOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingSlideId(null);
    }
  };

  const deleteSlide = async (id: string) => {
    if (id.startsWith('new-')) {
      setSlides((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    if (!confirm('Bu slaytı silmek istiyor musunuz?')) return;
    setSlideOpError('');
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/cms/hero-slides/${id}`, {
        method: 'DELETE',
      });
      const data = parseJsonOrThrow(await res.text(), 'Silme yanıtı JSON değil');
      if (!res.ok) throw new Error([data.error, data.detail].filter(Boolean).join(' — ') || 'Silme hatası');
      await loadSlides();
      setSlideMsg('Slayt silindi.');
    } catch (e: unknown) {
      setSlideOpError(e instanceof Error ? e.message : String(e));
    }
  };

  const addSlide = () => {
    setSlides((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, ...emptySlide() },
    ]);
  };

  const updateSlideLocal = (id: string, patch: Partial<HeroSlide>) => {
    setSlides((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const saveInfo = async (p: InfoPage) => {
    setInfoMsg('');
    try {
      const body = {
        slug: p.slug,
        title: p.title,
        description: p.description,
        sortOrder: p.sortOrder,
        isPublished: p.isPublished,
      };
      const isNew = p.id.startsWith('new-');
      const url = isNew
        ? `${apiFunctionsBase}/admin/cms/info-pages`
        : `${apiFunctionsBase}/admin/cms/info-pages/${p.id}`;
      const res = await adminFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kayıt hatası');
      await loadInfo();
      setInfoMsg('Kaydedildi.');
    } catch (e: any) {
      setInfoMsg(e?.message || String(e));
    }
  };

  const deleteInfo = async (id: string) => {
    if (id.startsWith('new-')) {
      setInfoPages((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    if (!confirm('Bu bilgi sayfasını silmek istiyor musunuz?')) return;
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/cms/info-pages/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadInfo();
    } catch (e: any) {
      setInfoMsg(e?.message || String(e));
    }
  };

  const addInfoPage = () => {
    setInfoPages((prev) => [
      {
        id: `new-${Date.now()}`,
        slug: 'yeni-sayfa',
        title: 'Yeni başlık',
        description: 'Uzun açıklama metnini buraya yazın.',
        sortOrder: 0,
        isPublished: false,
      },
      ...prev,
    ]);
  };

  return (
    <div className={`flex-1 overflow-y-auto ${pageClass}`}>
      <h1 className="text-2xl font-bold mb-2">Site içeriği</h1>
      <p className={`${mutedClass} mb-6`}>
        Ana sayfa slaytları veritabanından gelir; görsel dosya yüklerseniz{' '}
        <span className={isDark ? 'text-gray-200' : 'text-slate-800'}>public/img/slayt</span> altına yazılır ve sitede{' '}
        <span className={isDark ? 'text-gray-200' : 'text-slate-800'}>/img/slayt/…</span> adresiyle yayınlanır.
      </p>

      <div className="flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => setSection('slides')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${section === 'slides' ? tabActive : tabIdle}`}
        >
          <ImageIcon className="w-4 h-4" />
          Slaytlar
        </button>
        <button
          type="button"
          onClick={() => setSection('info')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${section === 'info' ? tabActive : tabIdle}`}
        >
          <FileText className="w-4 h-4" />
          Bilgi sayfaları
        </button>
      </div>

      {section === 'slides' && (
        <div className="space-y-6">
          {slideError ? (
            <div className={errMsgClass}>
              <p>{slideError}</p>
              <button
                type="button"
                onClick={() => void loadSlides()}
                className="mt-2 inline-flex items-center gap-1 text-sm underline"
              >
                <RefreshCw className="w-4 h-4" />
                Yeniden dene
              </button>
            </div>
          ) : null}
          {slideOpError ? (
            <div className={errMsgClass}>
              <p>{slideOpError}</p>
            </div>
          ) : null}
          {slideMsg ? (
            <div className={okMsgClass}>
              <p>{slideMsg}</p>
            </div>
          ) : null}
          <div className="flex justify-between items-center">
            <span className={`${mutedClass} text-sm`}>Sıra, başlık, açıklama, buton ve görsel URL alanlarını doldurun.</span>
            <button
              type="button"
              onClick={addSlide}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-lg text-white hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              Slayt ekle
            </button>
          </div>
          {slideLoading ? (
            <p className={mutedClass}>Yükleniyor…</p>
          ) : slides.length === 0 ? (
            <p className={mutedClass}>
              Henüz slayt yok. &quot;Slayt ekle&quot; ile oluşturun veya veritabanında cms_hero_slides tablosunu oluşturun.
            </p>
          ) : (
            slides.map((s) => (
              <div key={s.id} className={cardClass}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className={`text-xs ${mutedClass} block`}>
                    Sıra
                    <input
                      type="number"
                      className={inputClass}
                      value={s.sortOrder}
                      onChange={(e) => updateSlideLocal(s.id, { sortOrder: parseInt(e.target.value, 10) || 0 })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block`}>
                    Gradient (Tailwind)
                    <input
                      className={`${inputClass} text-sm`}
                      value={s.gradient}
                      onChange={(e) => updateSlideLocal(s.id, { gradient: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block md:col-span-2`}>
                    Başlık
                    <input
                      className={inputClass}
                      value={s.title}
                      onChange={(e) => updateSlideLocal(s.id, { title: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block md:col-span-2`}>
                    Alt başlık
                    <input
                      className={inputClass}
                      value={s.subtitle}
                      onChange={(e) => updateSlideLocal(s.id, { subtitle: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block md:col-span-2`}>
                    Açıklama
                    <textarea
                      rows={3}
                      className={inputClass}
                      value={s.description}
                      onChange={(e) => updateSlideLocal(s.id, { description: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block`}>
                    Buton metni
                    <input
                      className={inputClass}
                      value={s.buttonText}
                      onChange={(e) => updateSlideLocal(s.id, { buttonText: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block`}>
                    Buton linki (https…)
                    <input
                      className={`${inputClass} text-sm`}
                      value={s.buttonUrl}
                      onChange={(e) => updateSlideLocal(s.id, { buttonUrl: e.target.value })}
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block`}>
                    Ekleme tarihi
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={toDatetimeLocalValue(s.createdAt)}
                      onChange={(e) =>
                        updateSlideLocal(s.id, {
                          createdAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                        })
                      }
                    />
                  </label>
                  <label className={`text-xs ${mutedClass} block md:col-span-2`}>
                    Görsel URL
                    <input
                      className={`${inputClass} text-sm`}
                      value={s.imageUrl}
                      onChange={(e) => updateSlideLocal(s.id, { imageUrl: e.target.value })}
                      placeholder="/img/slayt/<dosya>.jpg"
                    />
                  </label>
                  <div className={`text-xs ${mutedClass} block md:col-span-2`}>
                    <label className="flex items-center gap-2 text-sm mb-2">
                      <input
                        type="checkbox"
                        checked={!!s.isSquareImage}
                        onChange={(e) =>
                          updateSlideLocal(s.id, {
                            isSquareImage: e.target.checked,
                            gradient: e.target.checked
                              ? SQUARE_SLIDE_GRADIENT
                              : 'from-blue-900 via-purple-900 to-pink-900',
                          })
                        }
                      />
                      Bu resimdir (400×400 kare görsel)
                    </label>
                    <span className="block mb-1">Veya dosya yükle (görsel olduğu gibi kaydedilir)</span>
                    <ImageUploadField
                      target={s.isSquareImage ? 'category' : 'slide'}
                      directUpload
                      disabled={uploadingSlideId === s.id || savingSlideId === s.id}
                      uploading={uploadingSlideId === s.id}
                      onFileReady={(f) => uploadSlideImage(s.id, f)}
                    />
                  </div>
                  {s.imageUrl ? (
                    <div className="md:col-span-2">
                      <img
                        src={resolveCmsPublicAssetUrl(s.imageUrl)}
                        alt="Slide preview"
                        className={`rounded border object-contain ${isDark ? 'border-gray-700' : 'border-slate-200'} ${
                          s.isSquareImage ? 'w-[200px] h-[200px]' : 'w-full max-h-40 object-cover'
                        }`}
                      />
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={s.isActive}
                      onChange={(e) => updateSlideLocal(s.id, { isActive: e.target.checked })}
                    />
                    Yayında
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void saveSlide(s)}
                    disabled={uploadingSlideId === s.id || savingSlideId === s.id}
                    className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {uploadingSlideId === s.id
                      ? 'Görsel yükleniyor…'
                      : savingSlideId === s.id
                        ? 'Kaydediliyor…'
                        : 'Kaydet'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSlide(s.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-900/60 text-red-200 rounded-lg hover:bg-red-900"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {section === 'info' && (
        <div className="space-y-6">
          {infoError ? (
            <div className={errMsgClass}>
              <p>{infoError}</p>
              <button
                type="button"
                onClick={() => void loadInfo()}
                className="mt-2 inline-flex items-center gap-1 text-sm underline"
              >
                <RefreshCw className="w-4 h-4" />
                Yeniden dene
              </button>
            </div>
          ) : null}
          {infoMsg ? (
            <div className={okMsgClass}>
              <p>{infoMsg}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-3 items-center">
            <p className={`${mutedClass} text-sm`}>
              Liste tarihe göre yeniden eskiye (DESC) sayfalanır. Açıklama alanı uzun metin içindir.
            </p>
            <button
              type="button"
              onClick={addInfoPage}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-lg text-white hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              Sayfa ekle
            </button>
          </div>
          {infoLoading ? (
            <p className="text-gray-400">Yükleniyor…</p>
          ) : (
            <>
              {infoPages.map((p) => (
                <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-xs text-gray-400 block">
                      Slug (url)
                      <input
                        className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        value={p.slug}
                        onChange={(e) =>
                          setInfoPages((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, slug: e.target.value.trim().toLowerCase() } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="text-xs text-gray-400 block">
                      Sıra
                      <input
                        type="number"
                        className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                        value={p.sortOrder}
                        onChange={(e) =>
                          setInfoPages((prev) =>
                            prev.map((x) =>
                              x.id === p.id ? { ...x, sortOrder: parseInt(e.target.value, 10) || 0 } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="text-xs text-gray-400 block md:col-span-2">
                      Başlık
                      <input
                        className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                        value={p.title}
                        onChange={(e) =>
                          setInfoPages((prev) => prev.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))
                        }
                      />
                    </label>
                    <label className="text-xs text-gray-400 block md:col-span-2">
                      Açıklama (desc)
                      <textarea
                        rows={8}
                        className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm"
                        value={p.description}
                        onChange={(e) =>
                          setInfoPages((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, description: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={p.isPublished}
                        onChange={(e) =>
                          setInfoPages((prev) =>
                            prev.map((x) => (x.id === p.id ? { ...x, isPublished: e.target.checked } : x)),
                          )
                        }
                      />
                      Yayında
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveInfo(p)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600"
                    >
                      <Save className="w-4 h-4" />
                      Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteInfo(p.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-900/60 text-red-200 rounded-lg hover:bg-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sil
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  disabled={infoPage <= 1}
                  onClick={() => setInfoPage((x) => Math.max(1, x - 1))}
                  className="p-2 rounded-lg bg-gray-800 text-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-gray-400 text-sm">
                  Sayfa {infoPage} / {infoTotalPages}
                </span>
                <button
                  type="button"
                  disabled={infoPage >= infoTotalPages}
                  onClick={() => setInfoPage((x) => x + 1)}
                  className="p-2 rounded-lg bg-gray-800 text-white disabled:opacity-40"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
