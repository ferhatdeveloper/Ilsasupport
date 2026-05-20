/**
 * 🔐 Download Token Şifreleme Utility
 * Token'ları localStorage'de güvenli şekilde saklamak için
 */

// Şifreleme anahtarı (browser fingerprint + sabit key)
const getEncryptionKey = (): string => {
  // Browser fingerprint oluştur (user agent + screen + timezone)
  const fingerprint = `${navigator.userAgent}|${screen.width}x${screen.height}|${new Date().getTimezoneOffset()}`;
  
  // Hash oluştur (basit ama etkili)
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16);
};

/**
 * Token'ı şifrele
 */
export const encryptToken = (token: string): string => {
  const key = getEncryptionKey();
  let encrypted = '';
  
  for (let i = 0; i < token.length; i++) {
    const charCode = token.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    encrypted += String.fromCharCode(charCode ^ keyChar);
  }
  
  // Base64 encode
  return btoa(encrypted);
};

/**
 * Token şifresini çöz
 */
export const decryptToken = (encryptedToken: string): string => {
  const key = getEncryptionKey();
  
  try {
    // Base64 decode
    const encrypted = atob(encryptedToken);
    let decrypted = '';
    
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      decrypted += String.fromCharCode(charCode ^ keyChar);
    }
    
    return decrypted;
  } catch (error) {
    console.error('❌ Token decrypt hatası:', error);
    return '';
  }
};

/**
 * Şifreli token'ı localStorage'e kaydet
 */
export const storeEncryptedToken = (fileId: string, token: string): void => {
  const encrypted = encryptToken(token);
  const timestamp = Date.now().toString();
  
  localStorage.setItem(`dt_${fileId}`, encrypted);
  localStorage.setItem(`dt_${fileId}_ts`, timestamp);
  
  console.log(`🔐 Token şifreli olarak kaydedildi: ${fileId}`);
};

/**
 * Şifreli token'ı localStorage'den oku
 */
export const getEncryptedToken = (fileId: string): string | null => {
  const encrypted = localStorage.getItem(`dt_${fileId}`);
  
  if (!encrypted) {
    console.log(`⚠️ Token bulunamadı: ${fileId}`);
    return null;
  }
  
  const decrypted = decryptToken(encrypted);
  console.log(`🔓 Token şifresi çözüldü: ${fileId}`);
  
  return decrypted;
};

/**
 * Token'ı localStorage'den sil
 */
export const removeEncryptedToken = (fileId: string): void => {
  localStorage.removeItem(`dt_${fileId}`);
  localStorage.removeItem(`dt_${fileId}_ts`);
  console.log(`🧹 Token silindi: ${fileId}`);
};

/**
 * Süresi dolmuş tokenları temizle (10 dakikadan eski)
 */
export const cleanupExpiredTokens = (): void => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 dakika
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    
    if (key && key.startsWith('dt_') && key.endsWith('_ts')) {
      const timestamp = parseInt(localStorage.getItem(key) || '0', 10);
      
      if (now - timestamp > maxAge) {
        const fileId = key.replace('dt_', '').replace('_ts', '');
        keysToRemove.push(`dt_${fileId}`);
        keysToRemove.push(`dt_${fileId}_ts`);
      }
    }
  }
  
  if (keysToRemove.length > 0) {
    console.log(`🧹 ${keysToRemove.length / 2} süresi dolmuş token temizlendi`);
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
};
