import { getStoredJwtAccessToken } from './authTokens';
import { applyAccessTokenRotation } from './secureApi';

/**
 * Yönetim paneli API çağrıları — JWT rotasyonu (X-New-Access-Token) otomatik kaydedilir.
 * JWT tek kullanımlık olduğu için istekler sıraya alınır; aksi halde paralel çağrılar 401 verir.
 */
let adminFetchQueue: Promise<void> = Promise.resolve();

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const execute = async (): Promise<Response> => {
    const token = getStoredJwtAccessToken();
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(input, { ...init, headers });
    applyAccessTokenRotation(response);
    return response;
  };

  const result = adminFetchQueue.then(execute);
  adminFetchQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
