/** En yeni dosya listesinde «YENİ» rozeti gösterilecek kayıt sayısı (tarih DESC). */
export const NEW_FILE_BADGE_COUNT = 25;

export function isNewFileByIndex(index: number): boolean {
  return index >= 0 && index < NEW_FILE_BADGE_COUNT;
}
