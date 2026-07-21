import { useEffect, useState } from 'react';
import { apiFunctionsBase } from '../utils/supabase/info';
import {
  DESKTOP_PORTABLE_DOWNLOAD_URL,
  DESKTOP_PORTABLE_FILENAME,
} from '../constants/desktopApp';

type DesktopConfig = {
  downloadUrl: string;
  downloadFilename: string;
  requiredVersion: string;
  latestVersion: string;
};

export function useDesktopAppConfig(): DesktopConfig {
  const [cfg, setCfg] = useState<DesktopConfig>({
    downloadUrl: DESKTOP_PORTABLE_DOWNLOAD_URL,
    downloadFilename: DESKTOP_PORTABLE_FILENAME,
    requiredVersion: '1.0.3',
    latestVersion: '1.0.6',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiFunctionsBase}/desktop-app-config`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const path = String(data.downloadPath || '');
        const filename = path.split('/').filter(Boolean).pop() || DESKTOP_PORTABLE_FILENAME;
        setCfg({
          downloadUrl: data.downloadUrl || DESKTOP_PORTABLE_DOWNLOAD_URL,
          downloadFilename: filename,
          requiredVersion: data.requiredVersion || '1.0.3',
          latestVersion: data.latestVersion || '1.0.6',
        });
      } catch {
        /* varsayılan */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return cfg;
}
