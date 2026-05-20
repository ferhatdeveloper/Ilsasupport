import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import '../styles/modern-pages.css';

type ListItem = { id: string; slug: string; title: string; description: string; createdAt?: string };

interface InfoPagesPublicProps {
  onBack: () => void;
}

export function InfoPagesPublic({ onBack }: InfoPagesPublicProps) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<ListItem | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiFunctionsBase}/cms/info-pages?page=${page}&limit=8`);
      const data = await res.json();
      setItems(data.pages || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiFunctionsBase}/cms/info-pages/${encodeURIComponent(selectedSlug)}`);
        const data = await res.json();
        if (!cancelled && data.page) setDetail(data.page);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  if (selectedSlug && detail) {
    return (
      <div className="ilsa-page">
        <div className="ilsa-page-container max-w-3xl">
        <button
          type="button"
          onClick={() => setSelectedSlug(null)}
          className="text-red-400 hover:underline mb-6 flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Listeye dön
        </button>
        <article className="ilsa-surface p-8">
          <h1 className="ilsa-title text-3xl font-bold mb-4">{detail.title}</h1>
          <div className="ilsa-muted whitespace-pre-wrap leading-relaxed">{detail.description}</div>
        </article>
      </div>
      </div>
    );
  }

  return (
    <div className="ilsa-page">
      <div className="ilsa-page-container max-w-4xl">
      <button
        type="button"
        onClick={onBack}
        className="text-red-400 hover:underline mb-6 flex items-center gap-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Ana sayfaya dön
      </button>
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-10 h-10 text-purple-500" />
        <div>
          <h1 className="ilsa-title text-3xl font-bold">Bilgi sayfaları</h1>
          <p className="ilsa-muted text-sm mt-1">Yeniden eskiye sıralı; her kayıt uzun açıklama içerebilir.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500">Henüz yayınlanmış bilgi sayfası yok.</p>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSlug(it.slug)}
                  className="ilsa-surface w-full text-left p-5 hover:border-red-500/60 transition-colors"
                >
                  <h2 className="text-lg font-semibold ilsa-title">{it.title}</h2>
                  <p className="text-sm ilsa-muted mt-2 line-clamp-3 whitespace-pre-line">{it.description}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Sayfa {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
