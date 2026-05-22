import { useEffect, useRef } from 'react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../utils/supabase/info';
import { getStoredJwtAccessToken, isJwtAccessToken } from '../utils/authTokens';
import { fetchPublicSiteSettings } from '../utils/siteSettingsClient';

const LAST_FILE_KEY = 'ilsa_last_seen_file_id';

export function useNewFileToast(user: { id?: string } | null): void {
  const seenRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return;
    const jwt = getStoredJwtAccessToken();
    if (!jwt || !isJwtAccessToken(jwt)) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const settings = await fetchPublicSiteSettings();
        if (!settings.notifyNewFileToast || cancelled) return;

        const since = parseInt(localStorage.getItem(LAST_FILE_KEY) || '0', 10) || 0;
        const res = await fetch(
          `${apiFunctionsBase}/public/new-file-poll?sinceId=${since}`,
          { headers: { Authorization: `Bearer ${jwt}` } },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.hasNew && data.file) {
          localStorage.setItem(LAST_FILE_KEY, String(data.lastFileId || data.file.id));
          toast.info(`Yeni dosya: ${data.file.name}`, { duration: 8000 });
        } else if (data.lastFileId && !since) {
          localStorage.setItem(LAST_FILE_KEY, String(data.lastFileId));
        }
      } catch {
        /* ignore */
      }
    };

    void poll();
    const pollMs = Math.max(120_000, parseInt(localStorage.getItem('ilsa_new_file_poll_ms') || '180000', 10) || 180_000);
    const id = setInterval(() => void poll(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id]);
}
