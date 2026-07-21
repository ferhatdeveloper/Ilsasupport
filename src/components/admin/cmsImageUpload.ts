import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import type { CmsImageTarget } from '../../constants/cmsImageAspects';
import { getCmsImagePreset } from '../../constants/cmsImageAspects';

async function parseUploadResponse(res: Response): Promise<string> {
  const text = await res.text();
  let data: { imageUrl?: string; error?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Upload yanıtı JSON değil: ${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(data.error || 'Görsel yüklenemedi');
  if (!data.imageUrl) throw new Error('imageUrl dönmedi');
  return data.imageUrl;
}

/** CMS görselini sunucuya yükler (kırpılmış veya ham dosya) */
export async function uploadCmsImage(file: File, target: CmsImageTarget): Promise<string> {
  const preset = getCmsImagePreset(target);
  const formData = new FormData();
  formData.append('file', file);
  if (preset.uploadTarget === 'category') {
    formData.append('target', 'category');
  } else if (target === 'pricing') {
    formData.append('target', 'pricing');
  }

  const res = await adminFetch(`${apiFunctionsBase}/admin/cms/upload-image`, {
    method: 'POST',
    body: formData,
  });
  return parseUploadResponse(res);
}

/** Geriye dönük uyumluluk */
export async function uploadCategoryImage(file: File): Promise<string> {
  return uploadCmsImage(file, 'category');
}
