import { useEffect } from 'react';
import { applySeo, type SeoApplyOptions } from '../utils/seoDom';

/** Başlık ve meta etiketlerini `applySeo` ile günceller; DOM'a görünür çıktı vermez. */
export function SeoHead(props: SeoApplyOptions) {
  const { title, description, path, noindex, ogImagePath, extraAlternateUrls } = props;
  const extraKey = JSON.stringify(extraAlternateUrls ?? null);

  useEffect(() => {
    applySeo({
      title,
      description,
      path,
      noindex,
      ogImagePath,
      extraAlternateUrls,
    });
  }, [title, description, path, noindex, ogImagePath, extraKey]);

  return null;
}
