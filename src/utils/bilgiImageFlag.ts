/** Admin «Bu resimdir» → bilgi.bildiri = RESİM */
export function isBilgiImageEntry(value?: string | null): boolean {
  const v = String(value ?? '').trim().toLocaleUpperCase('tr-TR');
  return v === 'RESİM' || v === 'RESIM' || v.includes('RESİM') || v.includes('RESIM');
}

export function looksLikeRasterImageFilename(fileName: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|ico|avif)$/i.test(String(fileName || '').trim());
}

export function shouldOpenAsGoogleDriveImage(
  fileName: string,
  bildiriOrNotification?: string | null,
): boolean {
  return isBilgiImageEntry(bildiriOrNotification) || looksLikeRasterImageFilename(fileName);
}
