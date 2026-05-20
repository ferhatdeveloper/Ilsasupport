import { useState, useEffect, useCallback } from 'react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { authenticatedFetch, getBearerForApi } from '../utils/secureApi';

/** API ve dosya listesi arasında tutarlı karşılaştırma için */
export function normalizeFavoriteFileId(fileId: string | number): string {
  return String(fileId).trim();
}

export function useFavorites(accessToken: string | null | undefined) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!getBearerForApi(accessToken)) {
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${apiFunctionsBase}/favorites`, {}, accessToken);
      if (res.ok) {
        const data = await res.json();
        const ids = ((data.fileIds as string[]) || []).map(normalizeFavoriteFileId);
        setFavoriteIds(new Set(ids));
      }
    } catch (e) {
      console.error('favorites load:', e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFavorite = useCallback(
    async (fileId: string | number, fileName?: string, meta?: Record<string, unknown>) => {
      if (!getBearerForApi(accessToken)) return { ok: false as const, needAuth: true };
      const id = normalizeFavoriteFileId(fileId);
      try {
        const res = await authenticatedFetch(
          `${apiFunctionsBase}/favorites/toggle`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: id, fileName, meta }),
          },
          accessToken,
        );
        const data = await res.json();
        if (!res.ok) return { ok: false as const, error: data.error };
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (data.favorited) next.add(id);
          else next.delete(id);
          return next;
        });
        return { ok: true as const, favorited: !!data.favorited };
      } catch {
        return { ok: false as const, error: 'Bağlantı hatası' };
      }
    },
    [accessToken],
  );

  const isFavorite = useCallback(
    (fileId: string | number) => favoriteIds.has(normalizeFavoriteFileId(fileId)),
    [favoriteIds],
  );

  return { favoriteIds, loading, load, toggleFavorite, isFavorite };
}
