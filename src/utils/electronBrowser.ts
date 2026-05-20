import { isElectronShell } from './secureApi';

declare global {
  interface Window {
    ilsaOpenExternalUrl?: (url: string) => Promise<{ success?: boolean; error?: string }>;
  }
}

/** Masaüstü kabukta varsayılan tarayıcı (Chrome/Edge); web'de yeni sekme */
export async function openUrlInSystemBrowser(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  const u = String(url || '').trim();
  if (!u) return { success: false, error: 'İndirme adresi yok' };

  if (isElectronShell()) {
    if (typeof window.ilsaOpenExternalUrl !== 'function') {
      return {
        success: false,
        error: 'Masaüstü köprüsü bulunamadı. Uygulamayı güncel portable ile yeniden başlatın.',
      };
    }
    try {
      const result = await window.ilsaOpenExternalUrl(u);
      if (result?.success === false) {
        return { success: false, error: result.error || 'Tarayıcı açılamadı' };
      }
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Tarayıcı açılamadı',
      };
    }
  }

  const popup = window.open(u, '_blank', 'noopener,noreferrer');
  return popup ? { success: true } : { success: false, error: 'Açılır pencere engellendi' };
}
