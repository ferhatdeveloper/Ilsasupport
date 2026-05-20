import { useCallback, useRef, useState } from 'react';

/**
 * Admin sayfalarında JWT rotasyonu sırasında tam ekran "Yükleniyor" titremesini önler.
 * İlk yüklemede loading=true; sonraki yenilemeler sessiz kalır.
 */
export function useAdminPageLoad(initial = true) {
  const [loading, setLoading] = useState(initial);
  const loadedOnce = useRef(false);

  const beginLoad = useCallback(() => {
    if (!loadedOnce.current) setLoading(true);
  }, []);

  const endLoad = useCallback(() => {
    setLoading(false);
    loadedOnce.current = true;
  }, []);

  const resetLoad = useCallback(() => {
    loadedOnce.current = false;
    setLoading(true);
  }, []);

  return { loading, beginLoad, endLoad, resetLoad, setLoading };
}
