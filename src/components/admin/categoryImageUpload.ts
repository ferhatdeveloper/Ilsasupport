import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';

export async function uploadCategoryImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('target', 'category');

  const res = await adminFetch(`${apiFunctionsBase}/admin/cms/upload-image`, {
    method: 'POST',
    body: formData,
  });

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
