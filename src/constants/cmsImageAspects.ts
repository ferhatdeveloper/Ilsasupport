/** CMS görsel hedefleri — site yerleşimine göre sabit çıktı boyutu ve en-boy oranı */

export type CmsImageTarget = 'slide' | 'category' | 'pricing';

export type CmsImagePreset = {
  label: string;
  /** Genişlik / yükseklik */
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  mimeType: 'image/jpeg' | 'image/webp';
  quality: number;
  uploadTarget?: 'category';
  hint: string;
};

/** Ana sayfa hero: ~1860×200, object-cover */
const SLIDE_PRESET: CmsImagePreset = {
  label: 'Slayt / hero',
  aspectRatio: 1860 / 200,
  outputWidth: 1860,
  outputHeight: 200,
  mimeType: 'image/jpeg',
  quality: 0.88,
  hint: 'Geniş banner (yaklaşık 9:1). Sitede tam genişlikte gösterilir.',
};

/** Kategori ikonu — kare önizleme */
const CATEGORY_PRESET: CmsImagePreset = {
  label: 'Kategori',
  aspectRatio: 1,
  outputWidth: 400,
  outputHeight: 400,
  mimeType: 'image/jpeg',
  quality: 0.9,
  uploadTarget: 'category',
  hint: 'Kare (1:1), 400×400 px olarak kaydedilir.',
};

/** Paket kartı — kare kutu görseli */
const PRICING_PRESET: CmsImagePreset = {
  label: 'Paket görseli',
  aspectRatio: 1,
  outputWidth: 400,
  outputHeight: 400,
  mimeType: 'image/jpeg',
  quality: 0.88,
  hint: 'Kare (1:1), 400×400 px olarak kaydedilir.',
};

export const CMS_IMAGE_PRESETS: Record<CmsImageTarget, CmsImagePreset> = {
  slide: SLIDE_PRESET,
  category: CATEGORY_PRESET,
  pricing: PRICING_PRESET,
};

export function getCmsImagePreset(target: CmsImageTarget): CmsImagePreset {
  return CMS_IMAGE_PRESETS[target];
}

/** Kırpma atlanır (canvas ile işlenemez veya animasyon kaybı) */
export const CMS_SKIP_CROP_MIME = new Set(['image/svg+xml', 'image/gif']);

export function shouldSkipCrop(file: File): boolean {
  return CMS_SKIP_CROP_MIME.has(file.type) || /\.(svg|gif)$/i.test(file.name);
}
